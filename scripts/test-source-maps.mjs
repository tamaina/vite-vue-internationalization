/* global console */
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { SourceMap } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vueInternationalization } from '../dist/index.js';

const root = mkdtempSync(resolve('test/fixtures/maps-run-'));
const sourcemap = process.argv.includes('--inline-map') ? 'inline' : process.argv.includes('--hidden') ? 'hidden' : true;
const minify = process.argv.includes('--minify');
const source = `<locale locale="en">
title: English
hello: "Hello {name}"
items: {one: One}
</locale>
<locale locale="ja">
title: 日本語
hello: "こんにちは {name}"
items: {one: 一}
</locale>
<script setup>
function fail() {
  throw new Error("production-map-position");
}
function argumentsFail() {
  return $l.value.sfc.hello({name: (() => { throw new Error("map-values-position"); })()}, (() => { throw new Error("map-plural-position"); })());
}
function keyFail() {
  return $locale.value.sfc.items[(() => { throw new Error("map-key-position"); })()];
}
function nestedFail() {
  return $l.value.sfc.hello({name: $l.value.sfc.hello({name: (() => { throw new Error("map-nested-position"); })()})});
}
</script>
<template>
  <button @click="fail">{{ $locale.sfc.title }}</button>
  <button @click="argumentsFail">Arguments</button>
  <button @click="keyFail">Key</button>
  <button @click="nestedFail">Nested</button>
</template>`;
const labels = ['production-map-position', 'map-values-position', 'map-plural-position', 'map-key-position', 'map-nested-position'];

try {
	mkdirSync(`${root}/node_modules`);
	symlinkSync(resolve('.'), `${root}/node_modules/vite-vue-internationalization`, 'dir');
	writeFileSync(`${root}/index.html`, '<div id="app"></div><script type="module" src="/client.ts"></script>');
	writeFileSync(`${root}/client.ts`, 'import {createApp} from "vue"; import App from "./App.vue"; createApp(App).mount("#app");');
	writeFileSync(`${root}/App.vue`, source);
	for (const buildStrategy of ['virtual', 'inline-chunks']) {
		const outDir = `${root}/${buildStrategy}`;
		await build({ root, configFile: false, logLevel: 'silent', plugins: [vueInternationalization({ primaryLocale: 'en', buildStrategy }), vue()], build: { outDir, minify, sourcemap } });
		let checked = 0;
		for (const name of readdirSync(`${outDir}/assets`).filter(name => name.endsWith('.js'))) {
			const filename = `${outDir}/assets/${name}`;
			const code = readFileSync(filename, 'utf8');
			const error = /(?:new\s+)?Error\s*\(\s*["'`]production-map-position["'`]\s*\)/.exec(code);
			if (!error) continue;
			const mapFile = /\/\/# sourceMappingURL=(\S+)/.exec(code)?.[1];
			if (sourcemap === 'hidden') assert.equal(mapFile, undefined);
			else assert.ok(mapFile, `${buildStrategy}/${name}: missing sourceMappingURL`);
			if (sourcemap === 'inline') assert.ok(mapFile.startsWith('data:'));
			const map = new SourceMap(JSON.parse(mapFile?.startsWith('data:')
				? Buffer.from(mapFile.slice(mapFile.indexOf(',') + 1), 'base64').toString()
				: readFileSync(resolve(dirname(filename), mapFile ?? `${name}.map`), 'utf8')));
			for (const label of labels) {
				const found = new RegExp(`(?:new\\s+)?Error\\s*\\(\\s*["'\`]${label}["'\`]\\s*\\)`).exec(code);
				assert.ok(found, `${buildStrategy}/${name}: missing ${label}`);
				const generatedBefore = code.slice(0, found.index).split('\n');
				const originalBefore = source.slice(0, source.indexOf(`new Error("${label}")`)).split('\n');
				const mapping = map.findEntry(generatedBefore.length - 1, generatedBefore.at(-1).length);
				assert.equal(mapping.originalLine, originalBefore.length - 1, `${buildStrategy}/${name}: ${label} original line`);
				assert.equal(mapping.originalColumn, originalBefore.at(-1).length + (found[0].startsWith('new') ? 0 : 4), `${buildStrategy}/${name}: ${label} original column`);
				assert.ok(mapping.originalSource.endsWith('/App.vue'), `${buildStrategy}/${name}: original SFC`);
			}
			checked++;
		}
		assert.equal(checked, buildStrategy === 'virtual' ? 1 : 2);
		console.log(`Source maps ${buildStrategy} (${sourcemap}, minify=${minify}): ${checked} production chunks map to the original SFC location.`);
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}
