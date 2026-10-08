import { expect, it } from 'vitest';
import { createInlineLocaleMarker, getInlineLocaleHtmlLoaders, inlineLocaleChunks, replaceInlineLocaleHtml } from '../src/inline.js';

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

it('localizes final Vite dependency maps without changing CSS or lookalike strings', () => {
	const marker = createInlineLocaleMarker('/App.vue');
	const chunk = (fileName: string, code: string) => ({ type: 'chunk', fileName, code, imports: [], dynamicImports: [] });
	const bundle = {
		'assets/App.js': chunk('assets/App.js', `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Async.js","assets/async.css"])))=>i.map(i=>d[i]);
export const title = __VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)}, "sfc.title");
export const lookalike = "assets/Async.js";
minifiedPreload(() => import("./Async.js"), __vite__mapDeps([0,1]));`),
		'assets/Async.js': chunk('assets/Async.js', `export const title = __VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)}, "sfc.title");`),
	};
	inlineLocaleChunks(bundle, ['en', 'ja'], 'en', { '/App.vue': { en: { title: 'Title' }, ja: { title: 'タイトル' } } }, {});
	for (const locale of ['en', 'ja']) {
		const code = (bundle as Record<string, ReturnType<typeof chunk>>)[`assets/App.${locale}.js`].code;
		expect(code).toContain(`m.f=["assets/Async.${locale}.js","assets/async.css"]`);
		expect(code).toContain('lookalike = "assets/Async.js"');
		expect(code).toContain(`import("./Async.${locale}.js")`);
	}
});

it('replaces stale JS preload hints with selected-locale hints while retaining CSS and shared JS', () => {
	const html = '<link rel=modulepreload href="/assets/Child.js"><link rel="preload" as="script" href="/assets/App.js"><link rel="modulepreload" href="/assets/shared.js"><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/App.js"></script>';
	const manifest = { primaryLocale: 'en', entries: [
		{ fileName: 'assets/App.js', originalFileName: 'assets/App.js', isEntry: true, imports: ['assets/Child.js'], locales: { en: 'assets/App.en.js', ja: 'assets/App.ja.js' } },
		{ fileName: 'assets/Child.js', originalFileName: 'assets/Child.js', locales: { en: 'assets/Child.en.js', ja: 'assets/Child.ja.js' }, integrity: { en: 'sha384-child-en', ja: 'sha384-child-ja' } },
	] };
	const rewritten = replaceInlineLocaleHtml(html, manifest);
	expect(rewritten).not.toContain('href="/assets/Child.js"');
	expect(rewritten).not.toContain('href="/assets/App.js"');
	expect(rewritten).toContain('href="/assets/shared.js"');
	expect(rewritten).toContain('href="/assets/app.css"');
	const loaders = getInlineLocaleHtmlLoaders(rewritten, manifest);
	expect(loaders).toHaveLength(1);
	for (const locale of ['en', 'ja']) {
		expect(loaders[0].source).toContain(`/assets/Child.${locale}.js`);
		expect(loaders[0].source).toContain(`sha384-child-${locale}`);
	}
});
