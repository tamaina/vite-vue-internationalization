import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from 'vite';
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
			for (const query of ['vue&type=style&index=0&lang.css', 'vue&type=script', 'vue&type=template', 'vue&type=custom&blockType=locale', 'raw', 'url']) {
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
