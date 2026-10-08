/* SPDX-License-Identifier: MIT */
import { posix } from 'node:path';
import type { OutputBundle } from 'rolldown';
import type { LocaleAssetManifest } from './ssr.js';

type HtmlEntry = { html: string; scripts: string[]; css: string[]; supported: boolean };

function attributes(source: string): Map<string, string> {
	return new Map([...source.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/gu)]
		.map(match => [match[1].toLowerCase(), match.at(2) ?? match.at(3) ?? match.at(4) ?? '']));
}

function outputPath(url: string, html: string, base: string): string | undefined {
	const external = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(url);
	const externalBase = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(base);
	if (external && !externalBase) return undefined;
	if (base !== '' && base !== './' && url.startsWith(base)) return url.slice(base.length);
	if (external) return undefined;
	return url.startsWith('/') ? url.slice(1) : posix.normalize(posix.join(posix.dirname(html), url));
}

/** Reads only emitted local module scripts; incompatible HTML remains outside the SSR entry API. */
export function collectHtmlEntries(bundle: OutputBundle, base: string): HtmlEntry[] {
	const result: HtmlEntry[] = [];
	for (const asset of Object.values(bundle)) {
		if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
		const html = String(asset.source).replace(/<!--[\s\S]*?-->/gu, '');
		const scripts: string[] = [];
		const semantics: string[] = [];
		let unsupported = false;
		for (const match of html.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>/giu)) {
			const attrs = attributes(match[1]);
			if (attrs.get('type') !== 'module') continue;
			const src = attrs.get('src');
			const file = src && outputPath(src, asset.fileName, base);
			if (!file || !Object.hasOwn(bundle, file) || bundle[file].type !== 'chunk' || attrs.has('async')) { unsupported = true; continue; }
			scripts.push(file);
			semantics.push(JSON.stringify(['integrity', 'crossorigin', 'nonce', 'referrerpolicy'].map(key => attrs.get(key))));
		}
		if (scripts.length === 0 && !unsupported) continue;
		const css = [...html.matchAll(/<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/giu)].flatMap(match => {
			const attrs = attributes(match[1]);
			const href = attrs.get('href');
			const file = href && outputPath(href, asset.fileName, base);
			// Public/external stylesheets belong to the original HTML head, not
			// the bundler's client graph. Do not probe arbitrary hrefs on disk.
			return attrs.get('rel') === 'stylesheet' && file && Object.hasOwn(bundle, file) && bundle[file].type === 'asset' ? [file] : [];
		});
		result.push({ html: asset.fileName, scripts: [...new Set(scripts)], css, supported: !unsupported && new Set(semantics).size === 1 });
	}
	return result;
}

/** HTML aliases describe the final graph without changing independent script execution. */
export function addHtmlEntries(manifest: LocaleAssetManifest, entries: HtmlEntry[]): void {
	for (const entry of entries) {
		// The module map already represents multiple chunks. Absence of an entry alias
		// distinguishes HTML that cannot be represented by the single-entry SSR API.
		const scripts = entry.scripts.filter(key => !manifest.chunks[key].cssOnly);
		manifest.modules[entry.html] = scripts;
		delete manifest.entries[entry.html];
		if (!entry.supported || scripts.length !== 1) continue;
		const root = scripts[0];
		const key = `html:${entry.html}`;
		// A logical entry shares executable bytes/locales, but owns its HTML CSS.
		// No JS facade is emitted, and the shared chunk remains unmodified.
		manifest.chunks[key] = { ...manifest.chunks[root], css: [...new Set(entry.css)] };
		manifest.entries[entry.html] = key;
		manifest.modules[entry.html] = [key];
	}
}
