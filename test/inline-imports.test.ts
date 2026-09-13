import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import { vueInternationalization } from '../src/plugin.js';

it.each(['consumer.ts', 'consumer.tsx', 'Consumer.vue'])('resolves imported dictionaries and excludes non-SFC imports in %s', async (name) => {
	const root = mkdtempSync(join(tmpdir(), 'vvi-imports-'));
	try {
		const dictionary = join(root, 'Messages.vue');
		writeFileSync(dictionary, '<locale locale="en">title: Imported</locale>');
		const script = `import Messages from '@messages';
import type TypeOnly from '@type-only';
import { type default as NamedType } from '@named-type';
import Raw from '@messages?raw';
import Url from '@messages?url';
import External from '@external';
import Virtual from '@virtual';
import Missing from '@missing';
import ResolvedRaw from '@resolved-raw';
export const values = [Messages.$locale.title, External.$locale.title, Virtual.$locale.title, Missing.$locale.title, ResolvedRaw.$locale.title, Raw, Url];`;
		const source = name.endsWith('.vue') ? `<script lang="ts">${script}</script>` : name.endsWith('.tsx') ? `${script}\nexport const View = () => <p>{Messages.$locale.title}</p>;` : script;
		const file = join(root, name);
		writeFileSync(file, source);
		const plugin = vueInternationalization({ primaryLocale: 'en', buildStrategy: 'inline-chunks', scan: { include: [] } });
		await resolveConfig({ root, configFile: false, plugins: [plugin] }, 'build');
		const resolve = vi.fn(async (id: string) => {
			switch (id) {
				case '@messages': return { id: dictionary };
				case '@external': return { id: dictionary, external: true };
				case '@virtual': return { id: '\0virtual.vue' };
				case '@resolved-raw': return { id: `${dictionary}?raw` };
				default: return null;
			}
		});
		const context = { resolve, addWatchFile: vi.fn() };
		const start = plugin.buildStart as () => void;
		start.call(context as never);
		const transform = (plugin.transform as { handler: (code: string, id: string) => Promise<{ code: string }> }).handler;
		const output = await transform.call(context as never, source, file);
		expect(output.code).toContain('INLINE_LOCALE__');
		expect(output.code).not.toContain('Messages.$locale');
		expect(output.code).not.toContain('const $locale');
		for (const name of ['External', 'Virtual', 'Missing', 'ResolvedRaw']) expect(output.code).toContain(`${name}.$locale.title`);
		expect(resolve.mock.calls.map(([id]) => id)).toEqual(['@messages', '@external', '@virtual', '@missing', '@resolved-raw']);
		expect(resolve).toHaveBeenCalledWith('@messages', file, { skipSelf: true });
		expect(context.addWatchFile).toHaveBeenCalledWith(dictionary);
		const load = plugin.load as (id: string) => string;
		expect(load.call(context as never, '\0virtual:vite-vue-internationalization/locale/en')).toContain('Imported');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
