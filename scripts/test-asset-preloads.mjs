/* global console, URL */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';

// Accept an unpacked tarball so this also verifies the public package entry.
const packageRoot = resolve(process.env.VVI_PACKAGE_ROOT ?? '.');
const { vueInternationalization } = await import(pathToFileURL(`${packageRoot}/dist/index.js`).href);
mkdirSync(resolve('test/fixtures'), { recursive: true });
const root = mkdtempSync(resolve('test/fixtures/asset-preloads-'));
let browser, server;

function files(dir, prefix = '') {
	return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
		? Object.entries(files(`${dir}/${entry.name}`, `${prefix}${entry.name}/`))
		: [[`${prefix}${entry.name}`, readFileSync(`${dir}/${entry.name}`)]]));
}

try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(packageRoot, `${root}/node_modules/vite-vue-internationalization`, 'dir');
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, `import { createApp } from 'vue';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
const locale = new URL(location.href).searchParams.get('locale') ?? 'en';
const i18n = createInternationalization({ initialLocale: locale });
await i18n.ready;
const { default: App } = await import('./App.vue');
createApp(App).use(i18n).mount('#app');`);
	writeFileSync(`${root}/image.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="red"/></svg>');
	writeFileSync(`${root}/style.css`, '.probe { color: rgb(10, 20, 30); background-image: url("./image.svg"); }');
	// A TS setup block produces the Vue script subrequest that used to erase
	// the complete SFC dictionary. No host-side transform guard is installed.
	writeFileSync(`${root}/App.vue`, `<script setup lang="ts">
import image from './image.svg';
import './style.css';
</script><template><p class="probe">{{ $locale.sfc.title }}</p><img :src="image" /></template>
<locale locale="en" lang="json">{"title":"English title"}</locale>
<locale locale="ja" lang="json">{"title":"日本語タイトル"}</locale>`);
	browser = await chromium.launch({ headless: true });
	for (const strategy of ['virtual', 'inline-chunks']) {
		await build({ root, configFile: false, logLevel: 'silent',
			plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy: strategy }), vue()],
			build: { assetsInlineLimit: 0, minify: false, outDir: `${root}/out-${strategy}` },
		});
		const output = files(`${root}/out-${strategy}`);
		server = createServer((request, response) => {
			const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
			const bytes = output[path];
			if (!bytes) { response.statusCode = 404; response.end('missing'); return; }
			response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
			response.end(bytes);
		});
		await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
		for (const locale of ['en', 'ja']) {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', error => errors.push(String(error)));
			page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
			await page.addInitScript(() => {
				globalThis.__preloadLinks = [];
				const append = globalThis.Node.prototype.appendChild;
				globalThis.Node.prototype.appendChild = function (child) {
					if (child instanceof globalThis.HTMLLinkElement) globalThis.__preloadLinks.push({ rel: child.rel, href: child.href });
					return append.call(this, child);
				};
			});
			await page.goto(`http://127.0.0.1:${server.address().port}/?locale=${locale}`);
			await page.waitForSelector('.probe');
			assert.equal(await page.locator('.probe').textContent(), locale === 'ja' ? '日本語タイトル' : 'English title');
			assert.equal(await page.locator('.probe').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(10, 20, 30)');
			assert.equal(await page.locator('img').evaluate(async element => { await element.decode(); return element.naturalWidth; }), 16);
			const links = await page.evaluate(() => globalThis.__preloadLinks);
			assert.ok(links.some(link => link.rel === 'stylesheet' && link.href.endsWith('.css')), `${strategy}: dynamic CSS preload`);
			assert.ok(links.some(link => link.rel === 'modulepreload' && link.href.endsWith('.js')), `${strategy}: dynamic JS preload`);
			assert.deepEqual(links.filter(link => link.rel === 'modulepreload' && !link.href.endsWith('.js')), []);
			assert.deepEqual(errors, []);
			await page.close();
		}
		await new Promise(resolve => server.close(resolve));
		server = undefined;
	}
	console.log('Asset preloads: both strategies/locales preserve JS/CSS, decode images, retain TS SFC dictionaries, and produce no MIME errors.');
} finally {
	await browser?.close();
	await new Promise(resolve => server ? server.close(resolve) : resolve());
	rmSync(root, { recursive: true, force: true });
}
