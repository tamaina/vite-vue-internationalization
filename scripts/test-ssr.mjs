/* global document, window, getComputedStyle, console, process, URL */
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuilder } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';
import { resolveLocaleAssets } from '../dist/ssr.js';
import { vueInternationalization } from '../dist/index.js';

const root = resolve('test/fixtures/ssr');
const icu = process.argv.includes('--icu');
const inline = process.argv.includes('--inline');
const relativeBase = process.argv.includes('--relative');
const customManifest = process.argv.includes('--custom-manifest');
const viteManifestFile = customManifest ? 'metadata/client-assets.json' : '.vite/manifest.json';
const ssrManifestFile = customManifest ? 'metadata/server-assets.json' : '.vite/ssr-manifest.json';
const output = mkdtempSync(resolve('test/fixtures/ssr-output-'));
const link = resolve(root, 'node_modules');
mkdirSync(link, { recursive: true });
symlinkSync(resolve('.'), `${link}/vite-vue-internationalization`, 'dir');
const options = () => ({ root, base: relativeBase ? './' : '/', configFile: false, logLevel: 'silent', resolve: { alias: icu ? [{ find: './App.vue', replacement: resolve(root, 'IcuApp.vue') }] : [] }, plugins: [vueInternationalization({ primaryLocale: 'ja-JP', global: { 'ja-JP': { appName: '共通辞書' }, 'en-US': { appName: 'Global English' } }, messageSyntax: icu ? 'icu' : 'vue', buildStrategy: inline ? 'inline-chunks' : 'virtual' }), vue({ features: { componentIdGenerator: 'filepath' } })] });
let http, browser;
try {
	if (customManifest) writeFileSync(`${output}/unrelated-manifest.json`, 'Unrelated asset, intentionally not JSON.');
	const builder = await createBuilder({ ...options(), environments: {
		client: { build: { outDir: output, emptyOutDir: false, target: 'esnext', manifest: viteManifestFile, ssrManifest: ssrManifestFile, rolldownOptions: { input: resolve(root, 'client.ts') } } },
		edge: { consumer: 'server', build: { outDir: `${output}/server`, ssr: resolve(root, 'server.ts'), target: 'esnext' } },
	} });
	// plugin-vue 6 keeps its SFC descriptor cache at module scope; build the two graphs sequentially.
	await builder.build(builder.environments.client);
	await builder.build(builder.environments.edge);
	if (customManifest) assert.equal(readFileSync(`${output}/unrelated-manifest.json`, 'utf8'), 'Unrelated asset, intentionally not JSON.');
	const manifest = JSON.parse(readFileSync(`${output}/.vite/internationalization-manifest.json`, 'utf8'));
	for (const chunk of Object.values(manifest.chunks)) {
		if (chunk.cssOnly) continue;
		for (const asset of chunk.locales ? Object.values(chunk.locales) : [chunk]) assert.ok(existsSync(`${output}/${asset.file}`), `Manifest references missing JS: ${JSON.stringify(chunk)}`);
	}
	const ssrManifest = JSON.parse(readFileSync(`${output}/${ssrManifestFile}`, 'utf8'));
	const viteManifest = JSON.parse(readFileSync(`${output}/${viteManifestFile}`, 'utf8'));
	if (inline) assert.ok(viteManifest['client.ts'].internationalization?.locales['en-US'], 'Configured Vite manifest must include locale entries.');
	// Force Lazy.vue through the native Vite SSR-manifest integration path.
	delete manifest.modules['Lazy.vue'];

	const { render } = await import(pathToFileURL(`${output}/server/server.js`).href);
	const concurrent = await Promise.all([render('en-US'), render('ja-JP')]);
	assert.ok(concurrent[0].html.includes('English'));
	assert.ok(concurrent[1].html.includes('日本語'));
	http = createHttpServer(async (request, response) => {
		try {
			const assetPath = relativeBase ? request.url.replace(/^\/deployment/, '') : request.url;
			if (assetPath.startsWith('/assets/')) {
				response.setHeader('content-type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript');
				response.end(readFileSync(`${output}${assetPath}`));
				return;
			}
			const url = new URL(request.url, 'http://localhost');
			const locale = url.searchParams.get('serverLocale') ?? 'en-US';
			const { html, modules } = await render(locale);
			const assets = resolveLocaleAssets(manifest, { locale: url.searchParams.has('wrongEntry') ? 'ja-JP' : locale, entry: 'client.ts', modules, ssrManifest, assetBaseUrl: `http://${request.headers.host}/deployment/` });
			response.setHeader('content-type', 'text/html; charset=utf-8');
			response.end(`<html lang="${locale}" data-vvi-locale="${url.searchParams.has('badHandoff') ? 'unsupported' : locale}"><head>${assets.stylesheets.map(asset => `<link rel="stylesheet" href="${asset.href}">`).join('')}${assets.modulepreload.map(asset => `<link rel="modulepreload" href="${asset.href}"${asset.integrity ? ` integrity="${asset.integrity}" crossorigin` : ''}>`).join('')}</head><body><div id="app">${html}</div><script>window.ssrContent = document.querySelector('#app').textContent; window.ssrButton = document.querySelector('button'); window.ssrText = window.ssrButton.textContent; window.ssrParity = document.querySelector('#parity')?.textContent;</script><script type="module" src="${assets.entry.href}"${assets.entry.integrity ? ` integrity="${assets.entry.integrity}" crossorigin` : ''}></script></body></html>`);
		} catch (error) { response.statusCode = 500; response.end(String(error)); }
	});
	await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch({ headless: true });
	for (const locale of ['en-US', 'ja-JP']) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', error => errors.push(String(error)));
		page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
		await page.goto(`http://127.0.0.1:${http.address().port}/${relativeBase ? 'deployment/nested/route' : ''}?serverLocale=${locale}&locale=${locale === 'en-US' ? 'ja-JP' : 'en-US'}`);
		try { await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true' && document.querySelector('#lazy')?.getAttribute('data-ready') === 'true', undefined, { timeout: 10000 }); } catch (error) { throw new Error(`${error}\n${errors.join('\n')}\n${await page.content()}`); }
		assert.equal(await page.locator('#lazy').textContent(), locale === 'en-US' ? 'Lazy English' : '遅延日本語', JSON.stringify({ errors, manifest, html: await page.content() }));
		assert.equal(await page.locator('#global').textContent(), locale === 'en-US' ? 'Global English' : '共通辞書');
		assert.equal(await page.locator('#fallback').textContent(), '共通fallback');
		assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(90, 80, 70)');
		assert.equal(await page.locator('#literal-text').textContent(), '$locale.sfc.title');
		assert.equal(await page.locator('#literal-expression').textContent(), '$locale.sfc.title');
		if (!icu) {
			assert.equal(await page.locator('#computed-key').textContent(), 'computed');
			assert.equal(await page.locator('#missing-raw').textContent(), '$locale.sfc.missing');
			assert.equal(await page.locator('#missing-localizer').textContent(), '$locale.sfc.items.a.missing');
			assert.equal(await page.locator('#scalar-localizer').textContent(), '$locale.sfc.scalar');
			assert.equal(await page.locator('#linked-repeat').textContent(), 'Nested Nested');
			assert.equal(await page.locator('#raw-null').textContent(), '[null]');
			assert.equal(await page.locator('#raw-shape').textContent(), locale === 'en-US' ? '4' : '{"nested":"Primary"}');
		}
		assert.equal(await page.evaluate(() => window.ssrContent === document.querySelector('#app').textContent), true);
		assert.equal(await page.locator('#lazy').evaluate(element => getComputedStyle(element).color), 'rgb(60, 40, 20)');
		assert.equal(await page.locator('button').textContent(), locale === 'en-US' ? 'English: 1 items' : '日本語: 1 件');
		assert.equal(await page.evaluate(() => window.ssrButton === document.querySelector('button') && window.ssrText === window.ssrButton.textContent), true, JSON.stringify({ locale, errors, state: await page.evaluate(() => ({ initial: window.ssrText, current: document.querySelector('button').textContent, sameNode: window.ssrButton === document.querySelector('button') })) }));
		assert.equal(await page.locator('button').evaluate(element => getComputedStyle(element).color), 'rgb(20, 40, 60)');
		if (icu) {
			assert.equal(await page.locator('#adjacent').textContent(), '12');
			assert.deepEqual(JSON.parse(await page.locator('#parity').textContent()), ['12', '1,234.5', '$1,234.50', locale === 'en-US' ? '01/01/1970' : '1970/01/01', locale === 'en-US' ? '22nd' : '22th', '3', '1,234']);
			assert.equal(await page.evaluate(() => window.ssrParity === document.querySelector('#parity').textContent), true);
		}
		await page.locator('button').click();
		assert.equal(await page.locator('button').textContent(), locale === 'en-US' ? 'English: 2 items' : '日本語: 2 件');
		assert.deepEqual(errors, []);
		await page.close();
	}

	const failurePage = await browser.newPage();
	for (const mode of inline ? ['wrongEntry', 'badHandoff'] : ['badHandoff']) {
		const failures = [];
		const listener = error => failures.push(String(error));
		failurePage.on('pageerror', listener);
		await failurePage.goto(`http://127.0.0.1:${http.address().port}/?${mode}=1`);
		await failurePage.waitForFunction(() => document.readyState === 'complete');
		assert.ok(failures.some(error => /SSR locale|Unsupported SSR locale/.test(error)), failures.join('\n'));
		assert.equal(await failurePage.evaluate(() => document.documentElement.dataset.hydrated), undefined);
		failurePage.off('pageerror', listener);
	}
	const invalid = await failurePage.request.get(`http://127.0.0.1:${http.address().port}/?serverLocale=unsupported`);
	assert.equal(invalid.status(), 500);
	assert.match(await invalid.text(), /not available/);
	await failurePage.close();
	console.log(`SSR virtual/${inline ? 'inline-chunks' : 'virtual'} (${icu ? 'ICU' : 'Vue'}): locale, DOM, message results, events and CSS verified.`);
} finally {
	await browser?.close();
	await new Promise(resolve => http ? http.close(resolve) : resolve());
	rmSync(output, { recursive: true, force: true });
	rmSync(link, { recursive: true, force: true });
}
