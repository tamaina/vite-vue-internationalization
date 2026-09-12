import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import { vueInternationalization } from '../src/plugin.js';

it('keeps module collection and strategy separate for differently named environments', async () => {
	const root = mkdtempSync(join(tmpdir(), 'vvi-environments-'));
	const file = join(root, 'App.vue');
	const source = (title: string) => `<template>{{ $locale.sfc.title }}</template><locale locale="en" lang="json">${JSON.stringify({ title })}</locale>`;
	writeFileSync(file, source('disk'));
	const plugin = vueInternationalization({ primaryLocale: 'en', buildStrategy: 'inline-chunks' });
	await resolveConfig({ root, configFile: false, plugins: [plugin] }, 'build');
	const browser = { environment: { name: 'browser', config: { consumer: 'client' } }, emitFile: vi.fn() };
	const worker = { environment: { name: 'edge-worker', config: { consumer: 'server' } }, emitFile: vi.fn() };
	const start = plugin.buildStart as (...args: never[]) => unknown;
	const transform = (plugin.transform as { handler: (code: string, id: string) => { code: string } }).handler;
	const load = plugin.load as (id: string) => string;
	try {
		start.call(browser as never);
		start.call(worker as never);
		const clientOutput = transform.call(browser as never, source('client'), file);
		const serverOutput = transform.call(worker as never, source('server'), file);
		expect(clientOutput.code).toContain('__VUE_INTERNATIONALIZATION_INLINE_');
		expect(serverOutput.code).not.toContain('__VUE_INTERNATIONALIZATION_INLINE_');
		expect(serverOutput.code).toContain('virtual:vite-vue-internationalization');
		expect(load.call(browser as never, '\0virtual:vite-vue-internationalization/locale/en')).toContain('client');
		expect(load.call(worker as never, '\0virtual:vite-vue-internationalization/locale/en')).toContain('server');
		expect(load.call(browser as never, '\0virtual:vite-vue-internationalization')).toContain('Promise.resolve');
		expect(load.call(worker as never, '\0virtual:vite-vue-internationalization')).toContain('() => import(');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
