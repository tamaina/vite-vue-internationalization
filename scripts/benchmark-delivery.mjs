/* global window, performance */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';
import { vueInternationalization } from '../dist/index.js';

const modes = ['virtual', 'inline-chunks', 'route-prototype'];
const sizes = { small: { routes: 3, messages: 12, global: 20 }, large: { routes: 40, messages: 200, global: 1000 } };

function files(directory, prefix = '') {
	return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? Object.entries(files(`${directory}/${entry.name}`, `${prefix}${entry.name}/`)) : [[`${prefix}${entry.name}`, readFileSync(`${directory}/${entry.name}`)]]));
}

function dictionary(count, label, locale) {
	return Object.fromEntries(Array.from({ length: count }, (_, n) => [`k${n}`, `${locale} ${label} message ${n}: ${createHash('sha256').update(`${label}:${locale}:${n}`).digest('hex')}`]));
}

function fixture(root, shape, mode) {
	mkdirSync(root, { recursive: true });
	mkdirSync(`${root}/node_modules`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	const globals = Object.fromEntries(['ja', 'en'].map(locale => [locale, dictionary(shape.global, 'GLOBAL', locale)]));
	const routes = Array.from({ length: shape.routes }, (_, n) => Object.fromEntries(['ja', 'en'].map(locale => [locale, { ...dictionary(shape.messages, `SENTINEL_ROUTE_${n}`, locale), ...(locale === 'ja' ? { fallback: 'Fallback from primary' } : {}) }])));
	writeFileSync(`${root}/index.html`, '<html lang="en" data-vvi-locale="en"><div id="app"></div><script type="module" src="/main.js"></script></html>');
	writeFileSync(`${root}/main.js`, 'import{createApp}from\'vue\';import App from\'./App.vue\';import{boot}from\'./adapter.js\';const instance=await boot();const app=createApp(App);app.use(instance);app.mount(\'#app\');');
	writeFileSync(`${root}/App.vue`, `<script setup>
import {shallowRef,markRaw,nextTick,onMounted} from 'vue';import{prepare}from'./adapter.js';
const loaders=[${routes.map((_, n) => `()=>import('./Route${n}.vue')`).join(',')}];const current=shallowRef();
async function go(n){const start=performance.now();const [component]=await Promise.all([loaders[n](),prepare(n)]);current.value=markRaw(component.default);await nextTick();await new Promise(requestAnimationFrame);window.__bench={route:n,readyMs:performance.now()-start,initialMs:performance.now()};}
window.__go=go;onMounted(()=>go(0));
</script><template><component :is="current"/></template>`);
	for (let n = 0; n < routes.length; n++) {
		const common = 'const key=new URL(location.href).searchParams.get(\'key\')||\'k0\';';
		const script = mode === 'route-prototype' ? `import{useLocale}from'vite-vue-internationalization/runtime';import{getInstance}from'./adapter.js';const $locale=useLocale('/Route${n}.vue',getInstance(${n}));${common}` : common;
		const blocks = mode === 'route-prototype' ? '' : ['ja', 'en'].map(locale => `<locale locale="${locale}" lang="json">${JSON.stringify(routes[n][locale])}</locale>`).join('');
		writeFileSync(`${root}/Route${n}.vue`, `<script setup>${script}</script><template><h1 data-route="${n}">{{ $locale.sfc[key] }}</h1><p>{{ $locale.sfc.fallback }}</p><footer>{{ $locale.env[key] }}</footer></template>${blocks}`);
		if (mode === 'route-prototype') for (const locale of ['ja', 'en']) writeFileSync(`${root}/route${n}-${locale}.json`, JSON.stringify({ ...routes[n].ja, ...routes[n][locale] }));
	}
	if (mode === 'route-prototype') {
		for (const locale of ['ja', 'en']) writeFileSync(`${root}/global-${locale}.json`, JSON.stringify({ ...globals.ja, ...globals[locale] }));
		writeFileSync(`${root}/adapter.js`, `import{createInternationalization}from'vite-vue-internationalization/runtime';
const locale=document.documentElement.dataset.vviLocale;const globals={ja:()=>import('./global-ja.json'),en:()=>import('./global-en.json')};
const dictionaries=[${routes.map((_, n) => `{ja:()=>import('./route${n}-ja.json'),en:()=>import('./route${n}-en.json')}`).join(',')}];const instances=new Map();const pending=new Map();
export const boot=async()=>({install(){}});export const getInstance=n=>instances.get(n);
export function prepare(n){if(instances.has(n))return Promise.resolve();if(pending.has(n))return pending.get(n);const promise=Promise.all([globals[locale](),dictionaries[n][locale]()]).then(async([global,module])=>{const instance=createInternationalization({primaryLocale:'ja',initialLocale:locale,loaders:{[locale]:async()=>({global:global.default,modules:{['/Route'+n+'.vue']:module.default}})}});await instance.ready;instances.set(n,instance);}).finally(()=>pending.delete(n));pending.set(n,promise);return promise;}`);
	} else writeFileSync(`${root}/adapter.js`, 'import{createInternationalization}from\'virtual:vite-vue-internationalization\';export async function boot(){const instance=createInternationalization({initialLocale:\'en\'});await instance.ready;return instance;}export async function prepare(){}');
	return { globals, routes };
}

if (process.argv[2] === '--build') {
	const [root, size, mode] = process.argv.slice(3);
	const data = fixture(root, sizes[size], mode);
	const start = performance.now();
	await build({ root, configFile: false, logLevel: 'silent', plugins: [...(mode === 'route-prototype' ? [] : [vueInternationalization({ primaryLocale: 'ja', buildStrategy: mode, global: data.globals })]), vue()], build: { target: 'esnext', outDir: `${root}/dist`, manifest: true } });
	writeFileSync(`${root}/build-stats.json`, JSON.stringify({ buildMs: performance.now() - start, processPeakRssKiB: process.resourceUsage().maxRSS, inputDictionaryBytes: Buffer.byteLength(JSON.stringify(data)), inputDictionaryHash: createHash('sha256').update(JSON.stringify(data)).digest('hex') }));
} else {
	const root = mkdtempSync(resolve('test/fixtures/delivery-run-'));
	const result = { generatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model, versions: Object.fromEntries(['vite', 'vue', '@vue/compiler-sfc', '@vitejs/plugin-vue', '@playwright/test'].map(name => [name, JSON.parse(readFileSync(resolve('node_modules', name, 'package.json'), 'utf8')).version])), revision: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), sourceHashes: Object.fromEntries(['scripts/benchmark-delivery.mjs', 'src/inline.ts', 'src/plugin.ts', 'pnpm-lock.yaml'].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])) }, methodology: { gzipLevel: 6, browserRuns: 3, locale: 'en', network: 'loopback, no emulation', prototype: 'explicit per-route runtime instances, shared global import, premerged primary fallback' }, cases: [] };
	let browser, server;
	try {
		browser = await chromium.launch();
		result.environment.chromium = browser.version();
		for (const [size, shape] of Object.entries(sizes)) for (const mode of modes) {
			const work = `${root}/${size}-${mode}`;
			const child = spawnSync(process.execPath, [resolve('scripts/benchmark-delivery.mjs'), '--build', work, size, mode], { encoding: 'utf8' });
			assert.equal(child.status, 0, `${size}/${mode} build failed\n${child.stdout}\n${child.stderr}`);
			const output = files(`${work}/dist`);
			const requests = [];
			const compressedOutput = Object.fromEntries(Object.entries(output).map(([file, body]) => [file, gzipSync(body, { level: 6 })]));
			server = createServer((request, response) => {
				const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
				const body = output[path];
				if (!body) { response.writeHead(404); response.end(); return; }
				const compressed = compressedOutput[path];
				requests.push({ file: path, gzipBytes: compressed.length });
				response.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': compressed.length, 'cache-control': path === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
				response.end(compressed);
			});
			await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
			const runs = [];
			for (let run = 0; run < 3; run++) {
				const context = await browser.newContext();
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', error => errors.push(error.message));
				page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
				requests.length = 0;
				const selectedKey = `k${run * 3}`;
				await page.goto(`http://127.0.0.1:${server.address().port}/?key=${selectedKey}`);
				await page.waitForFunction(() => window.__bench?.route === 0);
				const snapshot = async label => {
					assert.deepEqual(errors, [], `${size}/${mode}: ${await page.locator('body').innerHTML()}`);
					const state = await page.evaluate(() => window.__bench);
					assert.equal(await page.locator('h1').innerText(), dictionary(shape.messages, `SENTINEL_ROUTE_${state.route}`, 'en')[selectedKey]);
					assert.equal(await page.locator('p').innerText(), 'Fallback from primary');
					assert.equal(await page.locator('footer').innerText(), dictionary(shape.global, 'GLOBAL', 'en')[selectedKey]);
					const transferred = requests.splice(0);
					const payload = transferred.map(item => output[item.file].toString()).join('\n');
					return { label, ...await page.evaluate(() => window.__bench), resourceTimeline: await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ file: new URL(entry.name).pathname, startTime: entry.startTime, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize }))), files: transferred, requests: transferred.length, gzipBytes: transferred.reduce((sum, item) => sum + item.gzipBytes, 0), routeMarkersInTransferredPayload: Array.from({ length: shape.routes }, (_, n) => n).filter(n => payload.includes(`SENTINEL_ROUTE_${n} message`)) };
				};
				const phases = [await snapshot('initial')];
				await page.evaluate(() => window.__go(1)); phases.push(await snapshot('route-1'));
				await page.evaluate(() => window.__go(0)); phases.push(await snapshot('return-cached'));
				assert.deepEqual(errors, []);
				runs.push(phases);
				await context.close();
			}
			await new Promise(resolve => server.close(resolve)); server = undefined;
			const stats = JSON.parse(readFileSync(`${work}/build-stats.json`, 'utf8'));
			result.cases.push({ size, shape, mode, ...stats, totalOutputBytes: Object.values(output).reduce((sum, body) => sum + body.length, 0), totalOutputGzipBytes: Object.values(output).reduce((sum, body) => sum + gzipSync(body, { level: 6 }).length, 0), outputFiles: Object.keys(output), runs });
			process.stdout.write(`${size}/${mode}: initial ${runs[0][0].gzipBytes} gzip bytes, transition ${runs[0][1].gzipBytes}, cached return ${runs[0][2].gzipBytes}\n`);
		}
		for (const size of Object.keys(sizes)) assert.equal(new Set(result.cases.filter(item => item.size === size).map(item => item.inputDictionaryHash)).size, 1, 'Compared strategies must use identical input dictionaries.');
		mkdirSync('notes/benchmarks', { recursive: true });
		writeFileSync('notes/benchmarks/delivery-comparison.json', JSON.stringify(result, null, 2) + '\n');
	} finally {
		await browser?.close();
		if (server) await new Promise(resolve => server.close(resolve));
		rmSync(root, { recursive: true, force: true });
	}
}
