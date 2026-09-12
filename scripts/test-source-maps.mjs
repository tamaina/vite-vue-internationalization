/* global console */
import assert from 'node:assert/strict';
import { SourceMap } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vueInternationalization } from '../dist/index.js';

const root = mkdtempSync(resolve('test/fixtures/maps-run-'));
const source = '<locale locale="en">\ntitle: English\n</locale>\n<locale locale="ja">\ntitle: 日本語\n</locale>\n<script setup>\nfunction fail() {\n  throw new Error("production-map-position");\n}\n</script>\n<template><button @click="fail">{{ $locale.sfc.title }}</button></template>';
const before = source.slice(0, source.indexOf('new Error')).split('\n');
const originalLine = before.length - 1;
const originalColumn = before.at(-1).length;
try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, 'import {createApp} from "vue"; import App from "./App.vue"; createApp(App).mount("#app");');
	writeFileSync(`${root}/App.vue`, source);
	for (const buildStrategy of ['virtual', 'inline-chunks']) {
		const outDir = `${root}/${buildStrategy}`;
		await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy }), vue()], build: { outDir, minify: false, sourcemap: true } });
		let checked = 0;
		for (const name of readdirSync(`${outDir}/assets`).filter(name => name.endsWith('.js'))) {
			const filename = `${outDir}/assets/${name}`;
			const code = readFileSync(filename, 'utf8');
			const error = /new Error\(["']production-map-position["']\)/.exec(code);
			if (!error) continue;
			const mapFile = /\/\/# sourceMappingURL=(\S+)/.exec(code)?.[1];
			assert.ok(mapFile, `${buildStrategy}/${name}: missing sourceMappingURL`);
			const map = new SourceMap(JSON.parse(readFileSync(resolve(dirname(filename), mapFile), 'utf8')));
			const generatedBefore = code.slice(0, error.index).split('\n');
			const mapping = map.findEntry(generatedBefore.length - 1, generatedBefore.at(-1).length);
			assert.equal(mapping.originalLine, originalLine, `${buildStrategy}/${name}: original line`);
			assert.equal(mapping.originalColumn, originalColumn, `${buildStrategy}/${name}: original column`);
			assert.ok(mapping.originalSource.endsWith('/App.vue'), `${buildStrategy}/${name}: original SFC`);
			checked++;
		}
		assert.equal(checked, buildStrategy === 'virtual' ? 1 : 2);
		console.log(`Source maps ${buildStrategy}: ${checked} production chunks map to the original SFC location.`);
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}
