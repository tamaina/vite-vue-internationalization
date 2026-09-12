import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocaleEnvDictionaryWithDiagnostics } from '../src/localeEnv.js';

describe('external dictionary diagnostic provenance', () => {
	it('uses unsaved document contents and clears diagnostics on correction', () => {
		const root = mkdtempSync(join(tmpdir(), 'vvi-diagnostics-'));
		const file = join(root, 'global.yaml');
		writeFileSync(file, 'title: [');
		try {
			const broken = loadLocaleEnvDictionaryWithDiagnostics(root, 'en', 'global.yaml');
			expect(broken.diagnostics).toHaveLength(1);
			expect(broken.diagnostics[0]).toMatchObject({ fileName: file });
			const corrected = loadLocaleEnvDictionaryWithDiagnostics(root, 'en', 'global.yaml', { readText: () => 'title: corrected' });
			expect(corrected.diagnostics).toEqual([]);
			expect(corrected.dictionary.title).toBe('corrected');
			expect(loadLocaleEnvDictionaryWithDiagnostics(root, 'en', 'global.yaml').diagnostics).toHaveLength(1);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it('associates each glob error with its own file and drops deleted files on refresh', () => {
		const root = mkdtempSync(join(tmpdir(), 'vvi-diagnostics-'));
		const json = join(root, 'a.json');
		const yaml = join(root, 'b.yaml');
		writeFileSync(json, '{invalid');
		writeFileSync(yaml, 'constructor: unsafe');
		try {
			const result = loadLocaleEnvDictionaryWithDiagnostics(root, 'en', ['*.json', '*.yaml']);
			expect(result.diagnostics.map(diagnostic => diagnostic.fileName)).toEqual([json, yaml]);
			rmSync(json);
			writeFileSync(yaml, 'title: corrected');
			expect(loadLocaleEnvDictionaryWithDiagnostics(root, 'en', ['*.json', '*.yaml']).diagnostics).toEqual([]);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
