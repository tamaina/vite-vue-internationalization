/* SPDX-License-Identifier: MIT */
import { expect, it } from 'vitest';
import { addHtmlEntries, collectHtmlEntries } from '../src/htmlEntries.js';
import { resolveLocaleAssets } from '../src/ssr.js';
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
	expect(manifest.modules['one.html']).toEqual(['a.js']);
	expect(manifest.modules['multi.html']).toEqual(['a.js', 'b.js']);
	for (const entry of ['multi.html', 'async.html', 'remote.html']) expect(() => resolveLocaleAssets(manifest, { locale: 'en', entry })).toThrow('one SSR hydration entry');
});
