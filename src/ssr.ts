/** A client chunk and its locale-specific output files. */
export type LocaleAssetChunk = {
	file: string;
	/** Vite removed this empty JS placeholder; only its CSS dependencies remain. */
	cssOnly?: boolean;
	integrity?: string;
	locales?: Record<string, { file: string; integrity?: string }>;
	imports: string[];
	dynamicImports: string[];
	css: string[];
};
/** Build artifact emitted to `.vite/internationalization-manifest.json`. */
export type LocaleAssetManifest = {
	version: 1;
	base: string;
	primaryLocale: string;
	locales: string[];
	entries: Record<string, string>;
	modules: Record<string, string[]>;
	chunks: Record<string, LocaleAssetChunk>;
};
/** A client asset with a resolved URL and optional integrity metadata. */
export type LocaleAsset = { file: string; href: string; integrity?: string };
/** Locale-specific initial assets for one SSR response. */
export type ResolvedLocaleAssets = {
	locale: string;
	entry: LocaleAsset;
	modulepreload: LocaleAsset[];
	stylesheets: LocaleAsset[];
};
/** Inputs selected by the application for one SSR response. */
export type ResolveLocaleAssetsOptions = {
	locale: string;
	/** Client entry module ID, HTML entry, or emitted chunk key. */
	entry: string;
	/** Vue SSR context modules used during this render. */
	modules?: Iterable<string>;
	/** Optional Vite SSR manifest for modules not present in the VVI module map. */
	ssrManifest?: Record<string, string[]>;
	/** Public base override; relative bases also require an absolute deployment URL. */
	base?: string;
	/** Deployment root URL used for a relative base, independent of the request path. */
	assetBaseUrl?: string;
};

function own<T>(record: Record<string, T>, key: string): T | undefined {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}

function normalizeModule(id: string): string {
	return id.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/^\//u, '');
}

/** Resolves only the selected locale's entry, used modules, static imports and CSS. */
export function resolveLocaleAssets(manifest: LocaleAssetManifest, options: ResolveLocaleAssetsOptions): ResolvedLocaleAssets {
	if (manifest.version !== 1) throw new Error('Unsupported VVI asset manifest version.');
	if (!manifest.locales.includes(options.locale)) throw new Error(`Unsupported locale "${options.locale}".`);
	const entryKey = own(manifest.entries, normalizeModule(options.entry)) ?? (Object.hasOwn(manifest.chunks, options.entry) ? options.entry : undefined);
	if (!entryKey) throw new Error(`Client entry "${options.entry}" is not in the VVI asset manifest.`);
	if (own(manifest.chunks, entryKey)?.cssOnly) throw new Error('A CSS-only asset cannot be used as the hydration entry.');
	const base = options.base ?? manifest.base;

	function asset(file: string, integrity?: string): LocaleAsset {
		let href: string;
		if (base === '' || base === './') {
			if (!options.assetBaseUrl) throw new Error('Relative asset base requires assetBaseUrl (the absolute deployment root URL).');
			href = new URL(file, options.assetBaseUrl.endsWith('/') ? options.assetBaseUrl : `${options.assetBaseUrl}/`).href;
		} else if (/^[a-z][a-z\d+.-]*:/iu.test(base)) {
			href = new URL(file, base.endsWith('/') ? base : `${base}/`).href;
		} else {
			href = `${base.endsWith('/') ? base : `${base}/`}${file}`;
		}
		return { file, href, ...(integrity ? { integrity } : {}) };
	}

	function selected(key: string): { chunk: LocaleAssetChunk; asset: LocaleAsset } {
		const chunk = own(manifest.chunks, key);
		if (!chunk) throw new Error(`Missing client chunk mapping "${key}".`);
		const localized = chunk.locales ? own(chunk.locales, options.locale) : chunk;
		if (!localized) throw new Error(`Missing "${options.locale}" asset for "${key}".`);
		return { chunk, asset: asset(localized.file, localized.integrity) };
	}

	const entry = selected(entryKey).asset;
	const preloads = new Map<string, LocaleAsset>();
	const styles = new Map<string, LocaleAsset>();
	const visited = new Set<string>();

	function visit(key: string) {
		if (visited.has(key)) return;
		visited.add(key);
		const result = selected(key);
		if (key !== entryKey && !result.chunk.cssOnly) preloads.set(result.asset.file, result.asset);
		for (const css of result.chunk.css) styles.set(css, asset(css));
		for (const dependency of result.chunk.imports) visit(dependency);
	}

	visit(entryKey);
	for (const id of options.modules ?? []) {
		const normalized = normalizeModule(id);
		const chunks = own(manifest.modules, normalized);
		if (chunks) { for (const key of chunks) visit(key); continue; }
		const fallback = options.ssrManifest && (own(options.ssrManifest, id) ?? own(options.ssrManifest, normalized));
		if (!fallback) throw new Error(`SSR module "${id}" has no client asset mapping.`);
		for (const file of fallback) {
			const path = file.startsWith(manifest.base) && manifest.base !== '' && manifest.base !== './' ? file.slice(manifest.base.length) : file.replace(/^\//u, '');
			const key = Object.keys(manifest.chunks).find(key => key === path || manifest.chunks[key].file === path || Object.values(manifest.chunks[key].locales ?? {}).some(asset => asset.file === path));
			if (key) visit(key);
			else if (path.endsWith('.css') && Object.values(manifest.chunks).some(chunk => chunk.css.includes(path))) styles.set(path, asset(path));
			else throw new Error(`SSR manifest asset "${file}" has no locale mapping.`);
		}
	}
	return { locale: options.locale, entry, modulepreload: [...preloads.values()], stylesheets: [...styles.values()] };
}
