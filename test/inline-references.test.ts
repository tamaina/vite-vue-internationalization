import { expect, it } from 'vitest';
import { augmentViteManifestJson, createInlineLocaleMarker, inlineLocaleChunks } from '../src/inline.js';

it('rewrites import/export references without rewriting filenames in user strings', () => {
	const marker = createInlineLocaleMarker('/Child.vue');
	const chunk = (fileName: string, code: string, imports: string[] = [], dynamicImports: string[] = []) => ({ type: 'chunk', fileName, code, imports, dynamicImports });
	const bundle = {
		'assets/Child.js': chunk('assets/Child.js', `export const x = __VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)}, "sfc.title");`),
		'assets/App.js': chunk('assets/App.js', 'import {x} from "./Child.js"; export {x as y} from "./Child.js"; export const lazy = () => import("./Child.js"); export const label = "./Child.js"; export const names = ["Child.js", "assets/Child.js"];', ['assets/Child.js'], ['assets/Child.js']),
		'assets/Unrelated.js': chunk('assets/Unrelated.js', 'export const label = "Child.js";'),
	} as Record<string, ReturnType<typeof chunk>>;
	inlineLocaleChunks(bundle, ['en', 'ja'], 'en', { '/Child.vue': { en: { title: 'English' }, ja: { title: '日本語' } } }, {});
	const code = bundle['assets/App.ja.js'].code;
	expect(code).toContain('from "./Child.ja.js"');
	expect(code).toContain('import("./Child.ja.js")');
	expect(code).toContain('label = "./Child.js"');
	expect(code).toContain('names = ["Child.js", "assets/Child.js"]');
	expect(bundle['assets/Unrelated.js'].code).toBe('export const label = "Child.js";');
	expect(bundle['assets/Unrelated.ja.js']).toBeUndefined();
});

it('registers final native manifest keys before resolving locale-specific dependencies', () => {
	const manifest = JSON.parse(augmentViteManifestJson(JSON.stringify({
		'_app.js': { file: 'assets/app.js' },
		'_shared.js': { file: 'assets/shared.js' },
	}), {
		primaryLocale: 'en', entries: [
			{ fileName: 'assets/app.js', originalFileName: 'assets/app.js', imports: ['assets/shared.js', 'assets/client.js'], locales: { en: 'assets/app.en.js', ja: 'assets/app.ja.js' } },
			{ fileName: 'assets/shared.js', originalFileName: 'assets/shared.js', locales: { en: 'assets/shared.en.js', ja: 'assets/shared.ja.js' } },
			{ fileName: 'assets/client.js', originalFileName: 'assets/client.js', facadeModuleId: '/project/client.ts', isEntry: true, locales: { en: 'assets/client.en.js', ja: 'assets/client.ja.js' } },
		],
	}, '/project'));
	expect(manifest['_app.js'].imports).toEqual(['_shared.js', 'client.ts']);
	expect(manifest['_app.js?locale=ja'].imports).toEqual(['_shared.js?locale=ja', 'client.ts?locale=ja']);
});
