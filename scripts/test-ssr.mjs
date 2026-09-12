/* global document, window, getComputedStyle, console */
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
const output = mkdtempSync(resolve('test/fixtures/ssr-output-'));
const link = resolve(root, 'node_modules');
mkdirSync(link, { recursive: true });
symlinkSync(resolve('.'), `${link}/vite-vue-internationalization`, 'dir');
const options = () => ({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'ja-JP' }), vue()] });
let http, browser;
try {
	await build({ ...options(), build: { outDir: output, target: 'esnext', manifest: true, rolldownOptions: { input: resolve(root, 'client.ts') } } });
	const manifest = JSON.parse(readFileSync(`${output}/.vite/manifest.json`, 'utf8'));
	const entry = manifest['client.ts'];
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
			response.end(`<html lang="${locale}" data-vvi-locale="${locale}"><head>${(entry.css ?? []).map(file => `<link rel="stylesheet" href="/${file}">`).join('')}</head><body><div id="app">${html}</div><script>window.ssrButton = document.querySelector('button'); window.ssrText = window.ssrButton.textContent;</script><script type="module" src="/${entry.file}"></script></body></html>`);
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
	await page.locator('button').click();
	assert.equal(await page.locator('button').textContent(), 'English: 2 items');
	assert.deepEqual(errors, []);
	console.log('SSR virtual hydration: server locale wins over URL, DOM preserved, event handler and scoped CSS verified.');
} finally {
	await browser?.close();
	await new Promise(resolve => http ? http.close(resolve) : resolve());
	rmSync(output, { recursive: true, force: true });
	rmSync(link, { recursive: true, force: true });
}
