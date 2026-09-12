/* global console, URL */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';
import { vueInternationalization } from '../dist/index.js';

const root = mkdtempSync(resolve('test/fixtures/hash-run-'));
let browser, server;

function files(directory, prefix = '') {
	return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
		? Object.entries(files(`${directory}/${entry.name}`, `${prefix}${entry.name}/`))
		: [[`${prefix}${entry.name}`, readFileSync(`${directory}/${entry.name}`)]]));
}

try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	mkdirSync(`${root}/nested`);
	writeFileSync(`${root}/nested/other.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, 'import {createApp} from \'vue\'; import App from \'./App.vue\'; createApp(App).mount(\'#app\');');
	const source = (title) => `<script setup>import {defineAsyncComponent} from 'vue';const Lazy=defineAsyncComponent(()=>import('./Lazy.vue'));</script><template><h1>{{ $locale.sfc.title }}</h1><Lazy/></template><locale locale="ja" lang="json">{"title":"日本語"}</locale><locale locale="en" lang="json">${JSON.stringify({ title })}</locale>`;
	writeFileSync(`${root}/Lazy.vue`, '<template><p class="lazy">{{ $locale.sfc.title }}</p></template><locale locale="ja" lang="json">{"title":"遅延"}</locale><locale locale="en" lang="json">{"title":"Lazy English"}</locale><style scoped>.lazy {color: rgb(10, 20, 30)}</style>');

	async function compile(name, title) {
		writeFileSync(`${root}/App.vue`, source(title));
		await build({ root, configFile: false, base: './', logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'ja', buildStrategy: 'inline-chunks' }), vue()], build: { outDir: `${root}/${name}`, manifest: true, rolldownOptions: { input: [resolve(root, 'index.html'), resolve(root, 'nested/other.html')] } } });
		return files(`${root}/${name}`);
	}

	const a = await compile('a', 'English A');
	const b = await compile('b', 'English B');
	const c = await compile('c', 'English B');
	assert.deepEqual(b, c, 'identical source must produce byte-identical output');
	let changed = 0;
	for (const [name, bytes] of Object.entries(b).filter(([name]) => name.endsWith('.js'))) {
		if (a[name]) assert.deepEqual(bytes, a[name], `same URL has different JS: ${name}`);
		else changed++;
	}
	assert.ok(changed > 0, 'translation edit must change JS URLs');
	const integrities = new Set(Object.values(b).map(bytes => `sha384-${createHash('sha384').update(bytes).digest('base64')}`));
	let checked = 0;
	for (const [name, bytes] of Object.entries(b).filter(([name]) => name.endsWith('.i18n-loader.js'))) {
		for (const [sri] of bytes.toString().matchAll(/sha384-[A-Za-z0-9+/=]+/g)) {
			assert.ok(integrities.has(sri), `loader SRI mismatch: ${name}`);
			checked++;
		}
	}
	assert.ok(checked >= 2, 'both locale integrities must be verified');
	const manifest = JSON.parse(b['.vite/manifest.json']);
	for (const entry of Object.values(manifest)) {
		assert.ok(b[entry.file], `missing manifest file ${entry.file}`);
		for (const css of entry.css ?? []) assert.ok(b[css], `missing CSS ${css}`);
		for (const key of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) assert.ok(manifest[key], `missing manifest key ${key}`);
	}
	const deployed = { ...a, ...b };
	server = createServer((request, response) => {
		const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
		const bytes = deployed[path];
		if (!bytes) { response.statusCode = 404; response.end('missing'); return; }
		response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
		response.end(bytes);
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch({ headless: true });
	for (const entry of ['index.html', 'nested/other.html']) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', error => errors.push(String(error)));
		page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
		page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
		await page.goto(`http://127.0.0.1:${server.address().port}/${entry}?locale=en`);
		try { await page.waitForSelector('.lazy', { timeout: 10000 }); } catch (error) { throw new Error(`${error}\n${errors.join('\n')}\n${await page.content()}`); }
		assert.equal(await page.locator('h1').textContent(), 'English B');
		assert.equal(await page.locator('.lazy').textContent(), 'Lazy English');
		assert.equal(await page.locator('.lazy').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(10, 20, 30)');
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log(`Inline hashes: ${changed} new JS URLs, deterministic repeat, ${checked} SRI checks, two entries + lazy CSS run with old assets retained.`);
} finally {
	await browser?.close();
	await new Promise(resolve => server ? server.close(resolve) : resolve());
	rmSync(root, { recursive: true, force: true });
}
