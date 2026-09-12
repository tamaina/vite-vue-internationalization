/* global document, window, getComputedStyle, console, process */
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';
import { vueInternationalization } from '../dist/index.js';

const root = resolve('test/fixtures/ssr');
const icu = process.argv.includes('--icu');
const inline = process.argv.includes('--inline');
const output = mkdtempSync(resolve('test/fixtures/ssr-output-'));
const link = resolve(root, 'node_modules');
mkdirSync(link, { recursive: true });
symlinkSync(resolve('.'), `${link}/vite-vue-internationalization`, 'dir');
const options = (client = false) => ({ root, configFile: false, logLevel: 'silent', resolve: { alias: icu ? [{ find: './App.vue', replacement: resolve(root, 'IcuApp.vue') }] : [] }, plugins: [vueInternationalization({ primaryLocale: 'ja-JP', messageSyntax: icu ? 'icu' : 'vue', buildStrategy: client && inline ? 'inline-chunks' : 'virtual' }), vue({ features: { componentIdGenerator: 'filepath' } })] });
let http, browser;
try {
	await build({ ...options(true), build: { outDir: output, target: 'esnext', manifest: true, rolldownOptions: { input: resolve(root, 'client.ts') } } });
	const manifest = JSON.parse(readFileSync(`${output}/.vite/manifest.json`, 'utf8'));
	const entry = manifest['client.ts'];
	const entryFile = entry.internationalization?.locales['en-US'] ?? entry.file;
	await build({ ...options(), build: { outDir: `${output}/server`, ssr: resolve(root, 'server.ts'), target: 'esnext' } });
	const { render } = await import(pathToFileURL(`${output}/server/server.js`).href);
	http = createHttpServer(async (request, response) => {
		try {
			if (request.url.startsWith('/assets/')) {
				response.setHeader('content-type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript');
				response.end(readFileSync(`${output}${request.url}`));
				return;
			}
			const locale = 'en-US';
			const html = await render(locale);
			response.setHeader('content-type', 'text/html');
			response.end(`<html lang="${locale}" data-vvi-locale="${locale}"><head>${(entry.css ?? []).map(file => `<link rel="stylesheet" href="/${file}">`).join('')}</head><body><div id="app">${html}</div><script>window.ssrButton = document.querySelector('button'); window.ssrText = window.ssrButton.textContent; window.ssrParity = document.querySelector('#parity')?.textContent;</script><script type="module" src="/${entryFile}"></script></body></html>`);
		} catch (error) { response.statusCode = 500; response.end(String(error)); }
	});
	await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', error => errors.push(String(error)));
	page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
	await page.goto(`http://127.0.0.1:${http.address().port}/?locale=ja-JP`);
	await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
	assert.equal(await page.locator('button').textContent(), 'English: 1 items');
	assert.equal(await page.evaluate(() => window.ssrButton === document.querySelector('button') && window.ssrText === window.ssrButton.textContent), true);
	assert.equal(await page.locator('button').evaluate(element => getComputedStyle(element).color), 'rgb(20, 40, 60)');
	if (icu) {
		assert.equal(await page.locator('#adjacent').textContent(), '12');
		assert.deepEqual(JSON.parse(await page.locator('#parity').textContent()), ['12', '1,234.5', '$1,234.50', '01/01/1970', '22nd', '3', '1,234']);
		assert.equal(await page.evaluate(() => window.ssrParity === document.querySelector('#parity').textContent), true);
	}
	await page.locator('button').click();
	assert.equal(await page.locator('button').textContent(), 'English: 2 items');
	assert.deepEqual(errors, []);
	console.log(`SSR virtual/${inline ? 'inline-chunks' : 'virtual'} (${icu ? 'ICU' : 'Vue'}): locale, DOM, message results, events and CSS verified.`);
} finally {
	await browser?.close();
	await new Promise(resolve => http ? http.close(resolve) : resolve());
	rmSync(output, { recursive: true, force: true });
	rmSync(link, { recursive: true, force: true });
}
