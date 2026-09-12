import { SourceMap } from 'node:module';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { SourceEdits } from '../src/sourceEdits.js';
import { transformVueSfc } from '../src/parse.js';
import { internals, vueInternationalization } from '../src/plugin.js';
import { rewriteInlineRuntimeLocaleAccess } from '../src/inline.js';

function position(source: string, text: string) {
	const offset = source.indexOf(text);
	expect(offset).toBeGreaterThanOrEqual(0);
	const before = source.slice(0, offset).split('\n');
	return [before.length - 1, (before.at(-1) ?? '').length] as const;
}

describe('composed SFC source maps', () => {
	it('preserves upstream sourceRoot and embedded source content when composing chunk maps', () => {
		const edits = new SourceEdits('generated();', 'chunk.js');
		edits.replace(edits.code, 0, 0, '/* injected */\n');
		const map = new SourceMap(JSON.parse(edits.generateMap({ version: 3, file: 'chunk.js', sources: ['Original.vue'], sourcesContent: ['original'], sourceRoot: '../src/', names: [], mappings: 'AACE' }, 'chunk.en.js').toString()));
		expect(map.payload.sourceRoot).toBe('../src/');
		expect(map.payload.sourcesContent).toEqual(['original']);
		expect(map.findEntry(1, 0)).toMatchObject({ originalLine: 1, originalColumn: 2, originalSource: 'Original.vue' });
	});
	it('composes inline template, helper, removal and injection edits', () => {
		const original = '<locale locale="en">\ntitle: Title\nhello: "Hello {name}"\n</locale>\n<script setup lang="ts">\nimport { useLocale as locale } from "vite-vue-internationalization";\nconst messages = locale(import.meta.url);\nconst name = "test";\nthrow new Error("inline-position");\n</script>\n<template>{{ $locale.sfc.title }} {{ $l.sfc.hello({ name }) }}</template>';
		const edits = new SourceEdits(original, '/App.vue');
		const output = internals.transformVueSfcInline(original, '/App.vue', '/', 'en', false, edits);
		if (!output) throw new Error('Expected an inline transform.');
		expect(edits.code).toBe(output);
		const map = new SourceMap(JSON.parse(edits.generateMap().toString()));
		for (const [generated, source] of [
			['throw new Error', 'throw new Error'],
			['{ name }', '{ name }'],
			['__VUE_INTERNATIONALIZATION_INLINE_TEXT__', '$locale.sfc.title'],
		]) {
			const [line, column] = position(output, generated);
			const [originalLine, originalColumn] = position(original, source);
			expect(map.findEntry(line, column)).toMatchObject({ originalLine, originalColumn });
		}
	});
	it('maps standalone inline helper replacements and subsequent statements', () => {
		const original = 'import { useLocale as locale } from "vite-vue-internationalization";\nconst value = locale(import.meta.url);\nthrow new Error("module-position");';
		const edits = new SourceEdits(original, '/helper.ts');
		const output = rewriteInlineRuntimeLocaleAccess(original, '/helper.ts', '/helper.ts', edits);
		const map = new SourceMap(JSON.parse(edits.generateMap().toString()));
		for (const [generated, source] of [['__VUE_INTERNATIONALIZATION_INLINE_LOCALE__', 'locale(import.meta.url)'], ['throw new Error', 'throw new Error']]) {
			const [line, column] = position(output, generated);
			const [originalLine, originalColumn] = position(original, source);
			expect(map.findEntry(line, column)).toMatchObject({ originalLine, originalColumn });
		}
	});
	it('maps a real Vite SSR exception back to the original SFC line and column', async () => {
		const root = mkdtempSync(join(tmpdir(), 'vvi-source-map-'));
		const filename = join(root, 'App.vue');
		const original = '<locale locale="en">\ntitle: Title\n</locale>\n<script>\nexport function fail() {\n  throw new Error("mapped-ssr-error");\n}\nexport default {};\n</script>\n<template>{{ $locale.sfc.title }}</template>';
		writeFileSync(filename, original);
		symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
		const server = await createServer({ root, configFile: false, resolve: { alias: { 'vite-vue-internationalization/runtime': resolve('src/runtime.ts') } }, plugins: [vueInternationalization({ primaryLocale: 'en' }), vue()], server: { middlewareMode: true }, logLevel: 'silent' });
		try {
			const module = await server.ssrLoadModule(filename);
			let failure: Error | undefined;
			try { module.fail(); } catch (error) { failure = error as Error; }
			expect(failure?.message).toBe('mapped-ssr-error');
			if (!failure) throw new Error('Expected an SSR exception.');
			server.ssrFixStacktrace(failure);
			const [line, column] = position(original, 'new Error');
			expect(failure?.stack).toContain(`${filename}:${line + 1}:${column + 1}`);
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
	it.each([
		'<script setup lang="ts" generic="T extends string">\nconst value: T | undefined = undefined;\nthrow new Error("setup-position");\n</script>',
		'<script>\nconst before = 1;\nexport default { fail() { throw new Error("options-position"); } };\nconst after = 2;\n</script>',
	])('retains original positions through removal, injection and moved export expressions', (script) => {
		const original = `<locale locale="en">\ntitle: Title\n</locale>\n${script}\n<template>{{ $locale.sfc.title }}</template>`;
		const edits = new SourceEdits(original, '/App.vue');
		const output = transformVueSfc(original, '/App.vue', { primaryLocale: 'en', edits });
		if (!output) throw new Error('Expected an SFC transform.');
		expect(edits.code).toBe(output);
		const map = new SourceMap(JSON.parse(edits.generateMap().toString()));
		for (const text of ['throw new Error', '$locale.sfc.title', ...(script.includes('const after') ? ['const before', 'const after'] : ['const value'])]) {
			const [line, column] = position(output, text);
			const [originalLine, originalColumn] = position(original, text);
			expect(map.findEntry(line, column)).toMatchObject({ originalLine, originalColumn });
		}
		expect(map.payload.sourcesContent).toEqual([original]);
	});
});
