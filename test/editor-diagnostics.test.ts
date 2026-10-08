import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectEditorDiagnostics } from '../src/editorDiagnostics.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'vvi-editor-'));
	roots.push(root);
	return root;
}

const config = (global: unknown) => JSON.stringify({ vueCompilerOptions: { plugins: [{ name: 'vite-vue-internationalization/volar', global }] } });

describe('editor config and dictionary diagnostics', () => {
	it('tracks inherited JSONC options while resolving dictionaries from the project root', () => {
		const root = fixture();
		mkdirSync(join(root, 'settings'));
		const base = join(root, 'settings/base.json');
		const project = join(root, 'tsconfig.json');
		const dictionary = join(root, 'global.yaml');
		writeFileSync(base, `// shared\n${config({ en: 'global.yaml' })}`);
		writeFileSync(project, '{"extends":"./settings/base.json"}');
		writeFileSync(dictionary, 'title: [');
		const result = collectEditorDiagnostics(project);
		expect(result.dependencies).toContain(base);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0].fileName).toBe(dictionary);
		const corrected = collectEditorDiagnostics(project, file => file === dictionary ? 'title: corrected' : readFileSync(file, 'utf8'));
		expect(corrected.diagnostics).toEqual([]);
	});
	it('reports unsupported sources on the config and removes them on an unsaved config edit', () => {
		const root = fixture();
		const project = join(root, 'tsconfig.json');
		writeFileSync(project, config({ en: 42 }));
		expect(collectEditorDiagnostics(project).diagnostics).toEqual([expect.objectContaining({ fileName: project, message: expect.stringContaining('Unsupported global source') })]);
		expect(collectEditorDiagnostics(project, () => config({})).diagnostics).toEqual([]);
		writeFileSync(project, config([]));
		expect(collectEditorDiagnostics(project).diagnostics[0].message).toContain('must be an object');
	});
	it('does not claim unrelated TypeScript project errors or execute plugin modules', () => {
		const root = fixture();
		const project = join(root, 'tsconfig.json');
		writeFileSync(project, '{"extends":"./missing.json","vueCompilerOptions":{"plugins":["./does-not-exist.cjs"]}}');
		expect(collectEditorDiagnostics(project).diagnostics).toEqual([]);
	});
	it('retains syntax ranges in JSON and does not mix projects', () => {
		const root = fixture();
		const first = join(root, 'tsconfig.json');
		const second = join(root, 'tsconfig.other.json');
		const dictionary = join(root, 'global.json');
		writeFileSync(first, config({ en: 'global.json' }));
		writeFileSync(second, config({ en: { title: 'valid' } }));
		writeFileSync(dictionary, '{\n "title": nope\n}');
		const result = collectEditorDiagnostics(first);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({ fileName: dictionary });
		expect(result.diagnostics[0].start).toBeGreaterThan(0);
		expect(collectEditorDiagnostics(second).diagnostics).toEqual([]);
	});
});
