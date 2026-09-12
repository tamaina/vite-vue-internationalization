/* global console, process, window */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as waitForWatcherWindow } from 'node:timers/promises';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium, expect } from '@playwright/test';
import { vueInternationalization } from '../dist/index.js';

const root = mkdtempSync(resolve('test/fixtures/hmr-run-'));
const outside = mkdtempSync(resolve('test/fixtures/hmr-external-'));
const strategy = process.argv.includes('--inline') ? 'inline-chunks' : 'virtual';
const mode = process.argv.includes('--all') ? 'all' : 'locale-sources';
let browser, server;
const source = (title, color = 'red') => `<script setup>import {locales} from 'virtual:vite-vue-internationalization';</script><template><p id="title">{{ $locale.sfc.title }}</p><p id="global">{{ $locale.env.label }}</p><p id="extra">{{ $locale.env.extra }}</p><p id="locales">{{ locales.join(',') }}</p></template><locale locale="en" lang="json">${JSON.stringify(title ? { title } : {})}</locale><style scoped>#title {color:${color}}</style>`;
try {
	mkdirSync(`${root}/node_modules`);
	mkdirSync(`${root}/locales`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, 'import {createApp} from \'vue\'; import {createInternationalization} from \'virtual:vite-vue-internationalization\'; import App from \'./App.vue\';const app=createApp(App);const i18n=createInternationalization();app.use(i18n);await i18n.ready;app.mount(\'#app\');');
	writeFileSync(`${root}/App.vue`, source('Initial'));
	writeFileSync(`${root}/server-helper.ts`, 'import {createInternationalization,useLocale} from \'virtual:vite-vue-internationalization\';const instance=createInternationalization();await instance.ready;export const label=useLocale(\'\',instance).value.env.label;');
	writeFileSync(`${outside}/en.yaml`, 'label: Initial global\n');
	server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy, sfcTransform: mode, global: { en: [`${outside}/en.yaml`, 'locales/*.json'] } }), vue()], server: { host: '127.0.0.1', port: 0 } });
	await server.listen();
	const events = [];
	server.watcher.on('all', (event, file) => { if (file.endsWith('en.yaml')) events.push([event, file]); });
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(server.resolvedUrls.local[0]);
	await expect(page.locator('#title')).toHaveText('Initial');
	await expect(page.locator('#global')).toHaveText('Initial global');
	assert.equal((await server.ssrLoadModule('/server-helper.ts')).label, 'Initial global');

	writeFileSync(`${root}/App.vue`, source('Edited'));
	await expect(page.locator('#title')).toHaveText('Edited');
	await page.evaluate(() => { window.noReload = 'kept'; });
	writeFileSync(`${root}/App.vue`, source('Edited', 'blue'));
	await expect(page.locator('#title')).toHaveCSS('color', 'rgb(0, 0, 255)');
	assert.equal(await page.evaluate(() => window.noReload), 'kept', 'CSS-only edit should preserve translation and page state');
	await expect(page.locator('#title')).toHaveText('Edited');

	writeFileSync(`${outside}/en.yaml`, 'label: Changed outside root\n');
	await expect(page.locator('#global')).toHaveText('Changed outside root');
	assert.equal((await server.ssrLoadModule('/server-helper.ts')).label, 'Changed outside root');
	writeFileSync(`${root}/locales/new.json`, '{"extra":"New glob file"}');
	await expect(page.locator('#extra')).toHaveText('New glob file');
	rmSync(`${root}/locales/new.json`);
	await expect(page.locator('#extra')).toHaveText('$locale.env.extra');

	writeFileSync(`${root}/New.vue`, '<locale locale="fr" lang="json">{"label":"French"}</locale>');
	await expect(page.locator('#locales')).toHaveText('en,fr');
	rmSync(`${root}/New.vue`);
	await expect(page.locator('#locales')).toHaveText('en');

	writeFileSync(`${root}/App.vue`, source(undefined, 'blue'));
	await expect(page.locator('#title')).toHaveText('$locale.sfc.title');
	writeFileSync(`${outside}/en.yaml`, 'label: [unterminated\n');
	await expect(page.locator('vite-error-overlay')).toBeAttached();
	// Chokidar drops repeated change notifications for 50 ms; simulate a distinct editor save.
	await waitForWatcherWindow(75);
	writeFileSync(`${outside}/en.yaml`, 'label: Recovered\n');
	try { await expect(page.locator('#global')).toHaveText('Recovered'); } catch (error) { throw new Error(`${error}\nWatch events: ${JSON.stringify(events)}\n${await page.content()}`); }
	await expect(page.locator('vite-error-overlay')).not.toBeAttached();

	const raw = await page.evaluate(async () => (await import('/App.vue?raw')).default);
	assert.ok(raw.includes('<locale locale="en"'));
	assert.ok(!raw.includes('__useLocale'));
	const url = await page.evaluate(async () => (await import('/App.vue?url')).default);
	assert.ok(url.includes('App.vue'));
	await expect(page.locator('#global')).toHaveText('Recovered');
	console.log(`HMR ${strategy}/${mode}: SFC edits/removal, CSS, external YAML, glob add/delete, locale add/delete, malformed-data recovery and raw import verified.`);
} finally {
	await browser?.close();
	await server?.close();
	rmSync(root, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
}
