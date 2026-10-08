import { expect, it } from 'vitest';
import { createInlineLocaleMarker, inlineLocaleChunks } from '../src/inline.js';

it('preloads localized JavaScript and CSS, excluding media', () => {
	const marker = createInlineLocaleMarker('/App.vue');
	const chunk = (fileName: string, code: string, imports: string[] = [], css: string[] = [], assets: string[] = []) => ({
		type: 'chunk', fileName, code, imports, dynamicImports: [],
		viteMetadata: { importedCss: new Set(css), importedAssets: new Set(assets) },
	});
	const bundle = {
		'assets/App.js': chunk('assets/App.js', `export const title = __VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)}, "sfc.title"); preload(() => import("./Async.js"), __VITE_PRELOAD__);`),
		'assets/Async.js': chunk('assets/Async.js', 'import {shared} from "./Shared.js"; export default shared;', ['assets/Shared.js'], ['assets/async.css'], ['assets/image.png']),
		'assets/Shared.js': chunk('assets/Shared.js', `export const shared = __VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)}, "sfc.title");`, [], ['assets/shared.css'], ['assets/font.woff2', 'assets/icon.svg']),
	} as Record<string, ReturnType<typeof chunk>>;
	inlineLocaleChunks(bundle, ['en', 'ja'], 'en', { '/App.vue': { en: { title: 'Title' }, ja: { title: 'タイトル' } } }, {});
	for (const locale of ['en', 'ja']) {
		const code = bundle[`assets/App.${locale}.js`].code;
		const prefix = 'assets/';
		for (const file of [`Async.${locale}.js`, `Shared.${locale}.js`, 'async.css', 'shared.css']) expect(code).toContain(JSON.stringify(prefix + file));
		for (const file of ['image.png', 'font.woff2', 'icon.svg']) expect(code).not.toContain(file);
		expect(code).not.toContain('__VITE_PRELOAD__');
	}
});
