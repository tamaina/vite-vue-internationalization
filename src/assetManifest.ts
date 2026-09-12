import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { LocaleAssetManifest } from './ssr.js';
import type { InlineChunkManifest } from './inline.js';
import type { OutputBundle } from 'rolldown';

/** Captures the original Vite client graph before locale chunk rewriting. */
export function createAssetManifest(bundle: OutputBundle, root: string, base: string, primaryLocale: string, locales: string[]): LocaleAssetManifest {
	const manifest: LocaleAssetManifest = { version: 1, base, primaryLocale, locales, entries: {}, modules: {}, chunks: {} };
	const moduleId = (id: string) => relative(root, id).replaceAll('\\', '/');
	for (const chunk of Object.values(bundle)) {
		if (chunk.type !== 'chunk') continue;
		const metadata = chunk as typeof chunk & { viteMetadata?: { importedCss?: Set<string> } };
		manifest.chunks[chunk.fileName] = {
			file: chunk.fileName,
			imports: [...chunk.imports], dynamicImports: [...chunk.dynamicImports], css: [...(metadata.viteMetadata?.importedCss ?? [])],
		};
		const moduleIds = Object.keys(chunk.modules);
		if (manifest.chunks[chunk.fileName].css.length && chunk.exports.length === 0 && moduleIds.length && moduleIds.every(id => /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)(?:$|\?)/iu.test(id) || /[?&]type=style(?:&|$)/u.test(id))) manifest.chunks[chunk.fileName].cssOnly = true;
		if (chunk.isEntry && chunk.facadeModuleId) manifest.entries[moduleId(chunk.facadeModuleId)] = chunk.fileName;
		for (const id of Object.keys(chunk.modules)) (manifest.modules[moduleId(id)] ??= []).push(chunk.fileName);
	}
	return manifest;
}

/** Attaches rewritten locale files and their final integrity values to the graph. */
export function localizeAssetManifest(manifest: LocaleAssetManifest, inline: InlineChunkManifest): void {
	for (const entry of inline.entries) {
		if (!Object.hasOwn(manifest.chunks, entry.originalFileName)) throw new Error(`Missing original chunk "${entry.originalFileName}".`);
		const chunk = manifest.chunks[entry.originalFileName];
		chunk.locales = Object.fromEntries(Object.entries(entry.locales).map(([locale, file]) => [locale, { file, integrity: entry.integrity?.[locale] }]));
		// Includes any formatter import added after Vite's graph capture.
		chunk.imports = [...(entry.imports ?? [])];
	}
}

/** Keeps the standard Vite SSR manifest usable after original chunks are replaced. */
export function augmentSsrManifest(source: string, manifest: LocaleAssetManifest): string {
	const ssr = JSON.parse(source) as Record<string, string[]>;
	for (const [module, chunks] of Object.entries(manifest.modules)) {
		const files = new Set<string>();
		const visited = new Set<string>();

		function visit(key: string) {
			if (visited.has(key)) return;
			visited.add(key);
			const chunk = manifest.chunks[key];
			const selected = chunk.locales?.[manifest.primaryLocale] ?? chunk;
			if (!chunk.cssOnly) files.add(selected.file);
			for (const css of chunk.css) files.add(css);
			for (const dependency of chunk.imports) visit(dependency);
		}

		for (const key of chunks) visit(key);
		ssr[module] = [...files].map(file => manifest.base === '' || manifest.base === './' ? file : `${manifest.base}${file}`);
	}
	return `${JSON.stringify(ssr, null, 2)}\n`;
}

/** Hashes final written bytes, after Vite's remaining output hooks. */
export function finalizeAssetIntegrity(manifest: LocaleAssetManifest, outputDir: string, bundle: OutputBundle): void {
	for (const chunk of Object.values(manifest.chunks)) {
		if (chunk.cssOnly) {
			if (Object.hasOwn(bundle, chunk.file)) delete chunk.cssOnly;
			else {
				for (const css of chunk.css) if (!Object.hasOwn(bundle, css)) throw new Error(`Missing CSS output "${css}".`);
				continue;
			}
		}
		for (const asset of chunk.locales ? Object.values(chunk.locales) : [chunk]) {
			const filename = resolve(outputDir, asset.file);
			if (!Object.hasOwn(bundle, asset.file) || !existsSync(filename)) throw new Error(`Missing client JS output "${asset.file}".`);
			asset.integrity = `sha384-${createHash('sha384').update(readFileSync(filename)).digest('base64')}`;
		}
	}
}
