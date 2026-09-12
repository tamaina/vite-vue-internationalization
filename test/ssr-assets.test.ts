import { describe, expect, it } from 'vitest';
import { resolveLocaleAssets } from '../src/ssr.js';
import { augmentSsrManifest, finalizeAssetIntegrity } from '../src/assetManifest.js';
import type { LocaleAssetManifest, LocaleAssetChunk } from '../src/ssr.js';

function fixture(): LocaleAssetManifest {
	const localized = (name: string, imports: string[] = [], css: string[] = []): LocaleAssetChunk => ({
		file: `assets/${name}.js`, imports, css, dynamicImports: [],
		locales: { ja: { file: `assets/${name}.ja.js`, integrity: 'sha384-ja' }, en: { file: `assets/${name}.en.js`, integrity: 'sha384-en' } },
	});
	return {
		version: 1, base: '/app/', primaryLocale: 'ja', locales: ['ja', 'en'], entries: { 'src/client.ts': 'entry' },
		modules: { 'src/App.vue': ['entry'], 'src/Lazy.vue': ['lazy'] },
		chunks: {
			entry: { ...localized('entry', ['shared'], ['assets/app.css']), dynamicImports: ['lazy', 'unused'] },
			shared: { file: 'assets/shared.js', imports: ['entry'], dynamicImports: [], css: ['assets/shared.css'] },
			lazy: localized('lazy', ['shared'], ['assets/lazy.css']),
			unused: localized('unused', [], ['assets/unused.css']),
		},
	};
}

describe('SSR client asset resolution', () => {
	it('selects the locale and only preloads used lazy modules and static imports', () => {
		const assets = resolveLocaleAssets(fixture(), { locale: 'en', entry: '/src/client.ts', modules: new Set(['src/App.vue', 'src/Lazy.vue']) });
		expect(assets.entry).toEqual({ file: 'assets/entry.en.js', href: '/app/assets/entry.en.js', integrity: 'sha384-en' });
		expect(assets.modulepreload.map(asset => asset.file)).toEqual(['assets/shared.js', 'assets/lazy.en.js']);
		expect(assets.stylesheets.map(asset => asset.href)).toEqual(['/app/assets/app.css', '/app/assets/shared.css', '/app/assets/lazy.css']);
		expect(JSON.stringify(assets)).not.toContain('unused');
	});
	it('uses an explicit deployment URL for relative bases on nested routes', () => {
		const assets = resolveLocaleAssets(fixture(), { locale: 'ja', entry: 'src/client.ts', base: './', assetBaseUrl: 'https://example.com/application/' });
		expect(assets.entry.href).toBe('https://example.com/application/assets/entry.ja.js');
		expect(() => resolveLocaleAssets(fixture(), { locale: 'ja', entry: 'src/client.ts', base: './' })).toThrow('assetBaseUrl');
	});
	it('maps additional modules from the Vite SSR manifest', () => {
		const assets = resolveLocaleAssets(fixture(), { locale: 'en', entry: 'src/client.ts', modules: ['virtual:route'], ssrManifest: { 'virtual:route': ['/app/assets/lazy.js', '/app/assets/lazy.css'] } });
		expect(assets.modulepreload.map(asset => asset.file)).toContain('assets/lazy.en.js');
		expect(assets.stylesheets.map(asset => asset.file)).toContain('assets/lazy.css');
	});
	it('includes CSS-only modules without preloading their removed JS placeholders', () => {
		const manifest = fixture();
		manifest.chunks.theme = { file: 'assets/theme.js', cssOnly: true, imports: [], dynamicImports: [], css: ['assets/theme.css'] };
		manifest.modules['theme.css'] = ['theme'];
		expect(JSON.parse(augmentSsrManifest('{}', manifest))['theme.css']).toEqual(['/app/assets/theme.css']);
		const assets = resolveLocaleAssets(manifest, { locale: 'en', entry: 'src/client.ts', modules: ['theme.css'] });
		expect(assets.stylesheets.map(asset => asset.file)).toContain('assets/theme.css');
		expect(assets.modulepreload.map(asset => asset.file)).not.toContain('assets/theme.js');
		manifest.entries['theme.css'] = 'theme';
		expect(() => resolveLocaleAssets(manifest, { locale: 'en', entry: 'theme.css' })).toThrow('CSS-only');
	});
	it('rejects missing final JS and CSS outputs instead of silently leaving stale mappings', () => {
		expect(() => finalizeAssetIntegrity(fixture(), '/unwritten-output', {})).toThrow('Missing client JS output');
		const manifest = fixture();
		manifest.chunks = { theme: { file: 'theme.js', cssOnly: true, imports: [], dynamicImports: [], css: ['theme.css'] } };
		expect(() => finalizeAssetIntegrity(manifest, '/unwritten-output', {})).toThrow('Missing CSS output');
	});
	it('rejects unsupported locales and incomplete mappings instead of choosing another locale', () => {
		for (const options of [{ locale: 'bad', entry: 'src/client.ts' }, { locale: 'en', entry: 'bad' }, { locale: 'en', entry: 'src/client.ts', modules: ['bad'] }]) {
			expect(() => resolveLocaleAssets(fixture(), options)).toThrow();
		}
		const manifest = fixture();
		delete manifest.chunks.lazy.locales?.en;
		expect(() => resolveLocaleAssets(manifest, { locale: 'en', entry: 'src/client.ts', modules: ['src/Lazy.vue'] })).toThrow('Missing "en" asset');
	});
});
