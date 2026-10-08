/* SPDX-License-Identifier: MIT */
import { expect, it } from 'vitest';
import { addHtmlEntries, collectHtmlEntries } from '../src/htmlEntries.js';
import { resolveLocaleAssets } from '../src/ssr.js';
import { augmentSsrManifest } from '../src/assetManifest.js';
import type { OutputBundle } from 'rolldown';
import type { LocaleAssetManifest } from '../src/ssr.js';

it('counts distinct executable roots, preserving shared HTML and explicit JS entries', () => {
	const manifest: LocaleAssetManifest = {
		version: 1, base: '/', primaryLocale: 'en', locales: ['en'],
		entries: { 'main.ts': 'a.js' }, modules: {},
		chunks: Object.fromEntries(['a.js', 'b.js', 'css.js'].map(file => [file, { file, imports: [], dynamicImports: [], css: [], ...(file === 'css.js' ? { cssOnly: true } : {}) }])),
	};
	const html = (source: string) => ({ type: 'asset', source });
	const bundle = Object.fromEntries(Object.entries({
		'one.html': html('<script type="module" src="/a.js"></script><script type="module" src="/a.js"></script><script type="module" src="/css.js"></script><link rel="modulepreload" href="/b.js">'),
		'shared.html': html('<script type="module" src="/a.js"></script>'),
		'multi.html': html('<script type="module" src="/a.js"></script><script type="module" src="/b.js"></script>'),
		'async.html': html('<script type="module" async src="/a.js"></script>'),
		'remote.html': html('<script type="module" src="https://example.com/remote.js"></script><script type="module" src="/a.js"></script>'),
		'a.js': { type: 'chunk' }, 'b.js': { type: 'chunk' }, 'css.js': { type: 'chunk' },
	}).map(([fileName, asset]) => [fileName, { ...asset, fileName }])) as OutputBundle;
	addHtmlEntries(manifest, collectHtmlEntries(bundle, '/'));
	for (const entry of ['one.html', 'shared.html', 'main.ts']) expect(resolveLocaleAssets(manifest, { locale: 'en', entry }).entry.file).toBe('a.js');
	expect(manifest.modules['one.html']).toEqual(['html:one.html']);
	expect(manifest.modules['multi.html']).toEqual(['a.js', 'b.js']);
	for (const entry of ['multi.html', 'async.html', 'remote.html']) expect(() => resolveLocaleAssets(manifest, { locale: 'en', entry })).toThrow('one SSR hydration entry');
});

it('keeps HTML stylesheet order and page-specific CSS separate from shared executable chunks', () => {
	const manifest: LocaleAssetManifest = {
		version: 1, base: '/', primaryLocale: 'en', locales: ['en'], entries: { 'main.ts': 'a.js' }, modules: {},
		chunks: { 'a.js': { file: 'a.js', imports: [], dynamicImports: [], css: ['base.css'] } },
	};
	const bundle = Object.fromEntries(Object.entries({
		'one.html': { type: 'asset', source: '<link rel="stylesheet" href="/one.css"><link rel="stylesheet" href="/base.css"><script type="module" src="/a.js"></script>' },
		'two.html': { type: 'asset', source: '<link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/two.css"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="//cdn.example.com/remote.css"><script type="module" src="/a.js"></script>' },
		'a.js': { type: 'chunk' }, 'base.css': { type: 'asset' }, 'one.css': { type: 'asset' }, 'two.css': { type: 'asset' },
	}).map(([fileName, value]) => [fileName, { ...value, fileName }])) as OutputBundle;
	addHtmlEntries(manifest, collectHtmlEntries(bundle, '/'));
	for (const [entry, css] of [['one.html', ['one.css', 'base.css']], ['two.html', ['base.css', 'two.css']]] as const) {
		const assets = resolveLocaleAssets(manifest, { locale: 'en', entry });
		expect(assets.entry.file).toBe('a.js');
		expect(assets.stylesheets.map(asset => asset.file)).toEqual(css);
		expect(assets.modulepreload).toEqual([]);
		expect(JSON.parse(augmentSsrManifest('{}', manifest))[entry].filter((file: string) => file.endsWith('.css'))).toEqual(css.map(file => '/' + file));
	}
	expect(manifest.chunks['a.js'].css).toEqual(['base.css']);
	expect(resolveLocaleAssets(manifest, { locale: 'en', entry: 'main.ts' }).stylesheets.map(asset => asset.file)).toEqual(['base.css']);
});
