import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer, resolveConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vueInternationalization } from '../src/plugin.js';

describe('SFC request boundaries', () => {
	it.each(['locale-sources', 'all'] as const)('preserves dictionaries across subrequests (%s)', async (sfcTransform) => {
		const root = mkdtempSync(join(tmpdir(), 'vvi-subrequests-'));
		const filename = join(root, 'App.vue');
		const source = '<template><p>{{ $locale.sfc.title }}</p></template>\n<locale locale="en" lang="json">{"title":"English title"}</locale>\n<style scoped>p { color: red }</style>';
		writeFileSync(filename, source);
		const plugin = vueInternationalization({ primaryLocale: 'en', sfcTransform });
		const server = await createServer({ root, configFile: false, plugins: [plugin, vue()], server: { middlewareMode: true }, logLevel: 'silent' });
		try {
			const transform = (plugin.transform as { handler: (code: string, id: string) => Promise<unknown> }).handler;
			const load = plugin.load as (id: string) => string;
			await transform(source, filename);
			const before = load('\0virtual:vite-vue-internationalization/locale/en');
			expect(before).toContain('English title');
			for (const query of ['vue&type=style&index=0&lang.css', 'vue&type=script', 'vue&type=script&setup=true&lang.ts', 'vue&type=template', 'vue&type=custom&blockType=locale', 'raw', 'url']) {
				expect(await transform('p { color: blue }', `${filename}?${query}`)).toBeNull();
				expect(load('\0virtual:vite-vue-internationalization/locale/en')).toBe(before);
			}
			expect(await transform(source, `${filename}?v=123`)).not.toBeNull();
			await transform('<template><p>removed</p></template>', filename);
			expect(load('\0virtual:vite-vue-internationalization/locale/en')).not.toContain('English title');
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});

it.each(['component.ts', 'component.js'])('rewrites executable external Vue scripts in inline builds (%s)', async (name) => {
	const root = mkdtempSync(join(tmpdir(), 'vvi-external-script-'));
	try {
		const filename = join(root, name);
		const source = 'import { useLocale } from \'virtual:vite-vue-internationalization\'; export default { setup() { return { title: useLocale(import.meta.url).value.env.title }; } };';
		writeFileSync(filename, source);
		const plugin = vueInternationalization({ primaryLocale: 'en', buildStrategy: 'inline-chunks' });
		await resolveConfig({ root, configFile: false, plugins: [plugin] }, 'build');
		const transform = (plugin.transform as { handler: (code: string, id: string) => Promise<{ code: string } | null> }).handler;
		const extension = name.split('.').at(-1);
		for (const query of ['', '?v=123', `?vue&type=script&src=true&lang.${extension}`]) {
			const result = await transform(source, `${filename}${query}`);
			expect(result, query).not.toBeNull();
			expect(result?.code).toContain('__VUE_INTERNATIONALIZATION_INLINE_LOCALE__');
			expect(result?.code).not.toContain('useLocale(import.meta.url)');
		}
		for (const query of ['?raw', '?url', '?vue&type=script&src=true&raw', '?vue&type=script&src=true&url']) {
			expect(await transform(source, `${filename}${query}`)).toBeNull();
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
