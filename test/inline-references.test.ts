import { expect, it } from 'vitest';
import { createInlineLocaleMarker, inlineLocaleChunks } from '../src/inline.js';

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
