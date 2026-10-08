/* SPDX-License-Identifier: MIT */
/* global console, URL */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { build } from 'vite';
import { chromium } from '@playwright/test';

// Also run against the unpacked public package, without reaching into src.
const packageRoot = resolve(process.env.VVI_PACKAGE_ROOT ?? '.');
const { vueInternationalization } = await import(pathToFileURL(`${packageRoot}/dist/index.js`).href);
const { resolveLocaleAssets } = await import(pathToFileURL(`${packageRoot}/dist/ssr.js`).href);
const root = mkdtempSync(resolve('test/fixtures/client-graph-'));
let browser, server;

function source(file, code) { writeFileSync(`${root}/${file}`, code); }

function read(file) { return readFileSync(`${root}/dist/${file}`, 'utf8'); }

function manifest() { return JSON.parse(read('.vite/internationalization-manifest.json')); }

async function serve(html) {
	server = createServer((request, response) => {
		const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
		try {
			response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
			response.end(path === 'ssr.html' ? html : read(path));
		} catch { response.statusCode = 404; response.end('missing'); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

async function closeServer() {
	await new Promise(resolve => server.close(resolve));
	server = undefined;
}

function verifyFiles(m) {
	for (const chunk of Object.values(m.chunks)) {
		for (const css of chunk.css) read(css);
		if (chunk.cssOnly) continue;
		for (const asset of chunk.locales ? Object.values(chunk.locales) : [chunk]) {
			assert.equal(asset.integrity, `sha384-${createHash('sha384').update(read(asset.file)).digest('base64')}`);
		}
	}
	const native = JSON.parse(read('.vite/manifest.json'));
	for (const entry of Object.values(native)) {
		read(entry.file);
		for (const css of entry.css ?? []) read(css);
		for (const key of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
			assert.ok(native[key], `Missing native manifest key ${key}`);
			if (entry.isInternationalizationLocale && native[key].internationalization) assert.equal(native[key].locale, entry.locale);
		}
	}
}

try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(packageRoot, `${root}/node_modules/vite-vue-internationalization`, 'dir');
	browser = await chromium.launch();
	source('shared.css', '.probe {color:rgb(0,0,255)}');
	source('app.css', '.probe {color:rgb(255,0,0)}');
	source('lazy.css', '.lazy {color:rgb(10,20,30)}');
	source('raw.css', '.unused {color:green}');
	source('shared.ts', 'import \'./shared.css\';export const shared=\'shared\';');
	source('other.ts', 'import {shared} from \'./shared.ts\';console.log(shared);');
	source('lazy.ts', 'import \'./lazy.css\';export const ready=true;');
	source('client.ts', `import {shared} from './shared.ts';
import './app.css';
import raw from './raw.css?url';
import { createApp } from 'vue';
import { createInternationalization, useLocale } from 'virtual:vite-vue-internationalization';
const i18n=createInternationalization({initialLocale:document.documentElement.dataset.vviLocale || new URL(location.href).searchParams.get('locale') || 'en'});
await i18n.ready;
createApp({}).use(i18n);
document.querySelector('.probe').textContent=useLocale(import.meta.url).value.env.title+shared;
document.documentElement.dataset.raw=raw;
await import('./lazy.ts');
document.documentElement.dataset.ready='true';`);
	const shell = '<p class="probe"></p><p class="lazy">lazy</p>';
	source('index.html', `${shell}<script type="module" src="/client.ts"></script>`);
	source('shared.html', `${shell}<script type="module" src="/client.ts"></script>`);
	source('other.html', '<p class="probe">other</p><script type="module" src="/other.ts"></script>');
	for (const strategy of ['virtual', 'inline-chunks']) {
		for (const cssCodeSplit of [true, false]) {
			for (const entries of ['spa', 'shared', 'cascade']) {
				const input = entries === 'spa' ? resolve(root, 'index.html') : [resolve(root, 'index.html'), resolve(root, entries === 'shared' ? 'shared.html' : 'other.html')];
				await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy, global: { en: { title: 'English' }, ja: { title: '日本語' } } })], build: { target: 'esnext', manifest: true, cssCodeSplit, assetsInlineLimit: 0, rolldownOptions: { input } } });
				const m = manifest();
				verifyFiles(m);
				if (entries === 'shared') assert.equal(m.chunks[m.entries['index.html']].file, m.chunks[m.entries['shared.html']].file);
				for (const locale of ['en', 'ja']) {
					const assets = resolveLocaleAssets(m, { locale, entry: 'index.html', modules: ['lazy.ts'] });
					assert.ok(assets.stylesheets.length, 'Static and dynamic CSS must be represented');
					assert.ok(!assets.stylesheets.some(asset => /raw-/u.test(asset.file)), '?url CSS is not a stylesheet');
					const links = assets.stylesheets.map(asset => `<link rel="stylesheet" href="${asset.href}">`).join('') + assets.modulepreload.map(asset => `<link rel="modulepreload" href="${asset.href}" integrity="${asset.integrity}" crossorigin>`).join('');
					await serve(`<html data-vvi-locale="${locale}"><head>${links}</head><body>${shell}<script type="module" src="${assets.entry.href}" integrity="${assets.entry.integrity}" crossorigin></script></body></html>`);
					for (const route of entries === 'shared' ? ['index.html', 'shared.html', 'ssr.html'] : ['index.html', 'ssr.html']) {
						const page = await browser.newPage();
						const errors = [];
						page.on('pageerror', error => errors.push(String(error)));
						page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
						await page.goto(`http://127.0.0.1:${server.address().port}/${route}?locale=${locale}`);
						await page.waitForFunction(() => globalThis.document.documentElement.dataset.ready === 'true');
						assert.equal(await page.locator('.probe').textContent(), `${locale === 'en' ? 'English' : '日本語'}shared`, `${strategy}/${cssCodeSplit}/${entries}/${route}`);
						assert.equal(await page.locator('.probe').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(255, 0, 0)', `${strategy}/${cssCodeSplit}/${entries}/${route} cascade`);
						assert.equal(await page.locator('.lazy').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(10, 20, 30)');
						assert.deepEqual(errors, []);
						await page.close();
					}
					await closeServer();
				}
			}
		}
	}
	// Shared executable bytes must not union page-specific stylesheets.
	source('head-client.ts', `import { createApp } from 'vue';
import { createInternationalization, useLocale } from 'virtual:vite-vue-internationalization';
const i18n=createInternationalization({initialLocale:'en'});
await i18n.ready;
createApp({}).use(i18n);
const target=document.querySelector('.probe');
if(target)target.textContent=useLocale(import.meta.url).value.env.title;
document.documentElement.dataset.headReady='true';`);
	for (const [name, color] of [['one', 'rgb(255,0,0)'], ['two', 'rgb(0,0,255)']]) {
		source(`${name}.css`, `.probe{color:${color}}`);
		source(`${name}.html`, `<p class="probe">page</p><link rel="stylesheet" href="/${name}.css"><script type="module" src="/head-client.ts"></script>`);
	}
	for (const strategy of ['virtual', 'inline-chunks']) {
		await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy, global: { en: { title: 'Title' } } })], build: { manifest: true, rolldownOptions: { input: ['one', 'two'].map(name => resolve(root, `${name}.html`)) } } });
		const m = manifest();
		verifyFiles(m);
		assert.equal(m.chunks[m.entries['one.html']].file, m.chunks[m.entries['two.html']].file);
		for (const [name, color] of [['one', 'rgb(255, 0, 0)'], ['two', 'rgb(0, 0, 255)']]) {
			const assets = resolveLocaleAssets(m, { locale: 'en', entry: `${name}.html` });
			assert.equal(assets.stylesheets.length, 1);
			assert.ok(assets.stylesheets[0].file.includes(name));
			await serve(assets.stylesheets.map(asset => `<link rel="stylesheet" href="${asset.href}">`).join('') + `<p class="probe">page</p><script type="module" src="${assets.entry.href}" integrity="${assets.entry.integrity}" crossorigin></script>`);
			for (const route of [`${name}.html`, 'ssr.html']) {
				const page = await browser.newPage();
				await page.goto(`http://127.0.0.1:${server.address().port}/${route}`);
				await page.waitForFunction(() => globalThis.document.documentElement.dataset.headReady === 'true');
				assert.equal(await page.locator('.probe').textContent(), 'Title');
				assert.equal(await page.locator('.probe').evaluate(element => globalThis.getComputedStyle(element).color), color, `${strategy}/${route} page-specific CSS`);
				await page.close();
			}
			await closeServer();
		}
	}
	// Public and external stylesheet links remain owned by the original HTML
	// head. The resolver describes bundled CSS, without probing hrefs on disk.
	mkdirSync(`${root}/public`);
	mkdirSync(`${root}/static`);
	for (const dir of ['public', 'static']) source(`${dir}/site.css`, '.public-probe{color:rgb(10,20,30)}');
	source('public.html', '<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="https://example.invalid/remote.css"><link rel="stylesheet" href="//example.invalid/other.css"><p class="public-probe">public</p><p class="remote-probe">remote</p><script type="module" src="/head-client.ts"></script>');
	for (const strategy of ['virtual', 'inline-chunks']) {
		for (const publicDir of ['public', 'static', false]) {
			await build({ root, publicDir, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy, global: { en: { title: 'Title' } } })], build: { manifest: true, rolldownOptions: { input: resolve(root, 'public.html') } } });
			const m = manifest();
			verifyFiles(m);
			assert.deepEqual(resolveLocaleAssets(m, { locale: 'en', entry: 'public.html' }).stylesheets, []);
			assert.ok(read('public.html').includes('href="/site.css"'));
			assert.ok(read('public.html').includes('href="https://example.invalid/remote.css"'));
			assert.ok(read('public.html').includes('href="//example.invalid/other.css"'));
			if (publicDir === false) continue;
			assert.ok(read('site.css').includes('10,20,30'));
			await serve('');
			const page = await browser.newPage();
			await page.route(/example\.invalid/u, route => route.fulfill({ contentType: 'text/css', body: '.remote-probe{color:rgb(40,50,60)}' }));
			const errors = [];
			page.on('pageerror', error => errors.push(String(error)));
			page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
			await page.goto(`http://127.0.0.1:${server.address().port}/public.html`);
			assert.equal(await page.locator('.public-probe').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(10, 20, 30)');
			assert.equal(await page.locator('.remote-probe').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(40, 50, 60)');
			assert.deepEqual(errors, []);
			await page.close();
			await closeServer();
		}
	}
	// Aggregate asset names also follow Vite's library cssFileName/fileName/package rules.
	source('package.json', '{"name":"@fixture/client-graph","type":"module"}');
	source('library.ts', 'import \'./app.css\';export const value=1;');
	for (const lib of [{ cssFileName: 'custom-style' }, { fileName: 'custom-entry' }, {}]) {
		await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', global: { en: { title: 'Title' } } })], build: { manifest: true, cssCodeSplit: false, lib: { entry: resolve(root, 'library.ts'), formats: ['es'], ...lib } } });
		const m = manifest();
		const assets = resolveLocaleAssets(m, { locale: 'en', entry: 'library.ts' });
		assert.equal(assets.stylesheets.length, 1);
		assert.match(read(assets.stylesheets[0].file), /red|255/u);
		verifyFiles(m);
	}
	// Production minification lets Vite replace an import-only HTML facade with
	// genuinely independent module scripts. Their failures must remain independent.
	source('main.ts', 'import \'./a.ts\';import \'./b.ts\';');
	source('b.ts', 'globalThis.events.push(\'b\');');
	for (const [html, module] of [['index', 'main'], ['other', 'a'], ['third', 'b']]) source(`${html}.html`, `<script>globalThis.events=[];</script><script type="module" src="/${module}.ts"></script>`);
	for (const strategy of ['virtual', 'inline-chunks']) {
		for (const mode of ['await', 'failure']) {
			source('a.ts', `globalThis.events.push('a-start');${mode === 'failure' ? 'throw new Error(\'expected-module-failure\');' : 'await new Promise(resolve=>setTimeout(resolve,50));globalThis.events.push(\'a-end\');'}`);
			await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy, global: { en: { title: 'Title' } } })], build: { target: 'esnext', manifest: true, modulePreload: { polyfill: false }, rolldownOptions: { input: ['index', 'other', 'third'].map(name => resolve(root, `${name}.html`)) } } });
			const m = manifest();
			assert.equal(m.modules['index.html'].length, 2);
			assert.equal(m.entries['index.html'], undefined);
			assert.throws(() => resolveLocaleAssets(m, { locale: 'en', entry: 'index.html' }), /multiple independent/u);
			assert.ok(resolveLocaleAssets(m, { locale: 'en', entry: 'other.html' }).entry);
			assert.equal((read('index.html').match(/type="module"/gu) ?? []).length, 2);
			await serve('');
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			await page.goto(`http://127.0.0.1:${server.address().port}/`);
			await page.waitForFunction(() => globalThis.events.includes('b'));
			if (mode === 'await') await page.waitForFunction(() => globalThis.events.includes('a-end'));
			assert.deepEqual(await page.evaluate(() => globalThis.events), mode === 'failure' ? ['a-start', 'b'] : ['a-start', 'b', 'a-end']);
			assert.deepEqual(errors, mode === 'failure' ? ['expected-module-failure'] : []);
			await page.close();
			await closeServer();
		}
	}
	console.log('Final client graph: SPA/shared MPA/cascade, static + dynamic CSS with both split settings and strategies, locale preloads/SRI, independent script await/failure, per-page CSS, public/external HTML stylesheets and explicit SSR ambiguity verified.');
} finally {
	await browser?.close();
	if (server) await closeServer();
	rmSync(root, { recursive: true, force: true });
}
