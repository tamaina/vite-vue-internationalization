/* global console, URL */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { parseSync } from 'rolldown/utils';
import vue from '@vitejs/plugin-vue';
import { chromium } from '@playwright/test';
import { vueInternationalization } from '../dist/index.js';

const root = mkdtempSync(resolve('test/fixtures/import-run-'));
let browser, server;

function files(dir, prefix = '') {
	return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
		? Object.entries(files(`${dir}/${entry.name}`, `${prefix}${entry.name}/`))
		: [[`${prefix}${entry.name}`, readFileSync(`${dir}/${entry.name}`)]]));
}

try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	mkdirSync(`${root}/excluded`);
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, 'import { createApp } from \'vue\'; import App from \'./App.vue\'; createApp(App).mount(\'#app\');');
	const dictionaries = {
		ja: { title: 'タイトル', other: '別のタイトル', nested: { text: '本文' }, greeting: 'こんにちは {name}' },
		en: { title: 'Title', other: 'Other title', nested: { text: 'Body' }, greeting: 'Hello {name}' },
	};
	const writeMessages = () => writeFileSync(`${root}/excluded/Messages.vue`, Object.entries(dictionaries)
		.map(([locale, messages]) => `<locale locale="${locale}" lang="json">${JSON.stringify(messages)}</locale>`).join('\n'));
	writeMessages();
	writeFileSync(`${root}/Panel.vue`, `<script lang="ts">
globalThis.__vviEffects = (globalThis.__vviEffects ?? 0) + 1;
</script><script setup lang="ts">
import { defineInternationalization } from 'vite-vue-internationalization/runtime';
defineInternationalization({ ja: { title: 'パネル' }, en: { title: 'Panel' } });
</script><template><p class="panel">{{ $locale.sfc.title }}</p></template><style>.panel { color: rgb(10, 20, 30); }</style>`);
	writeFileSync(`${root}/read.ts`, `import Messages from '@messages';
import Panel from './Panel.vue';
const texts = Messages.$locale;
const { nested } = Messages.$locale;
const format = Messages.$l.greeting;
const localizers = Messages.$l;
const Other = Panel;
export const read = (key) => [texts[key], nested.text, format({ name: 'TS' }), localizers.greeting({ name: 'alias' }), Other.$locale.title];`);
	writeFileSync(`${root}/read.js`, `import { default as Messages } from '~dict/Messages.vue';
export const jsTitle = Messages.$locale.title;
export const jsDynamic = (key) => Messages.$l[key]({ name: 'JS' });`);
	writeFileSync(`${root}/App.vue`, `<script setup lang="ts">
import { ref } from 'vue';
import Messages from '@messages';
import Relative from './excluded/Messages.vue';
import Panel from './Panel.vue';
import { read } from './read.ts';
import { jsTitle, jsDynamic } from './read.js';
const key = ref('title');
const formatKey = ref('greeting');
const texts = Messages.$locale;
const { nested } = Messages.$locale;
const format = Messages.$l.greeting;
</script><template>
<h1>{{ Messages.$locale.title }}</h1>
<p id="dynamic">{{ Messages.$locale[key] }}</p>
<p id="alias">{{ texts[key] }}</p>
<p id="nested">{{ nested.text }}</p>
<p id="relative">{{ Relative.$locale.title }}</p>
<p id="format">{{ Messages.$l[formatKey]({ name: 'Vue' }) }}</p>
<p id="format-alias">{{ format({ name: 'alias' }) }}</p>
<p id="ts">{{ read(key).join('|') }}</p>
<p id="js">{{ jsTitle }}|{{ jsDynamic(formatKey) }}</p>
<p id="panel-title">{{ Panel.$locale.title }}</p><Panel />
<button @click="key = 'other'">change</button>
</template>`);

	async function compile(name) {
		await build({ root, configFile: false, logLevel: 'silent',
																resolve: { alias: [{ find: '@messages', replacement: `${root}/excluded/Messages.vue` }, { find: /^~dict\/(.*)$/, replacement: `${root}/excluded/$1` }] },
																plugins: [vueInternationalization({ primaryLocale: 'ja', buildStrategy: 'inline-chunks', scan: { exclude: ['excluded/**'] } }), vue()],
																build: { outDir: `${root}/${name}`, sourcemap: true, manifest: true },
		});
		return files(`${root}/${name}`);
	}

	const first = await compile('first');
	dictionaries.en.title = 'Updated title';
	writeMessages();
	const output = await compile('second');
	let changed = 0;
	for (const [name, bytes] of Object.entries(output).filter(([name]) => name.endsWith('.js'))) {
		const parsed = parseSync(name, bytes.toString());
		assert.deepEqual(parsed.errors.map(error => ({ message: error.message, labels: error.labels })), [], `invalid JavaScript: ${name}`);
		assert.ok(!bytes.toString().includes('__VUE_INTERNATIONALIZATION_INLINE_'), `unreplaced marker in ${name}`);
		if (first[name]) assert.deepEqual(bytes, first[name], `same URL changed bytes: ${name}`);
		else changed++;
	}
	assert.ok(changed > 0, 'imported dictionary edit must change chunk URLs');
	assert.ok(Object.keys(output).some(name => name.endsWith('.map')), 'source maps emitted');
	server = createServer((request, response) => {
		const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
		const bytes = output[path];
		if (!bytes) { response.statusCode = 404; response.end('missing'); return; }
		response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
		response.end(bytes);
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch({ headless: true });
	for (const locale of ['ja', 'en']) {
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', error => errors.push(String(error)));
		page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
		await page.goto(`http://127.0.0.1:${server.address().port}/?locale=${locale}`);
		try { await page.waitForSelector('.panel', { timeout: 10000 }); } catch (error) { throw new Error(`${error}\n${errors.join('\n')}\n${await page.content()}`); }
		const dictionary = dictionaries[locale];
		const panel = locale === 'ja' ? 'パネル' : 'Panel';
		const greeting = name => dictionary.greeting.replace('{name}', name);
		for (const selector of ['h1', '#relative', '#dynamic', '#alias']) assert.equal(await page.locator(selector).textContent(), dictionary.title);
		assert.equal(await page.locator('#nested').textContent(), dictionary.nested.text);
		assert.equal(await page.locator('#format').textContent(), greeting('Vue'));
		assert.equal(await page.locator('#format-alias').textContent(), greeting('alias'));
		assert.equal(await page.locator('#ts').textContent(), [dictionary.title, dictionary.nested.text, greeting('TS'), greeting('alias'), panel].join('|'));
		assert.equal(await page.locator('#js').textContent(), `${dictionary.title}|${greeting('JS')}`);
		for (const selector of ['.panel', '#panel-title']) assert.equal(await page.locator(selector).textContent(), panel);
		assert.equal(await page.evaluate(() => globalThis.__vviEffects), 1);
		assert.equal(await page.locator('.panel').evaluate(element => globalThis.getComputedStyle(element).color), 'rgb(10, 20, 30)');
		await page.locator('button').click();
		await page.waitForFunction(expected => globalThis.document.querySelector('#dynamic').textContent === expected, dictionary.other);
		assert.equal(await page.locator('#alias').textContent(), dictionary.other);
		assert.equal(await page.locator('#ts').textContent(), [dictionary.other, dictionary.nested.text, greeting('TS'), greeting('alias'), panel].join('|'));
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log('Inline imports: Vue/TS/JS, both locales, dynamic/aliased access, Vite aliases, excluded dictionary, component rendering/CSS/side effects, and hash updates passed.');
} finally {
	await browser?.close();
	await new Promise(resolve => server ? server.close(resolve) : resolve());
	rmSync(root, { recursive: true, force: true });
}
