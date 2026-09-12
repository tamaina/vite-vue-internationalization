import assert from 'node:assert/strict';
import process from 'node:process';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { createVueLanguagePlugin, forEachEmbeddedCode, getDefaultCompilerOptions } from '@vue/language-core';
import volar, { volarInternals } from '../dist/volar.js';

assert.equal(typeof globalThis.gc, 'function', 'Run with node --expose-gc.');
const irReferences = [];

function createLanguage(primaryLocale) {
	const wrapped = Object.assign(context => {
		const plugin = volar(context);
		const resolve = plugin.resolveEmbeddedCode;
		return { ...plugin, resolveEmbeddedCode(file, ir, embedded) {
			resolve(file, ir, embedded);
			if (embedded.id === 'script_ts') irReferences.push(new WeakRef(ir));
		} };
	}, { __moduleConfig: { name: 'vite-vue-internationalization/volar', primaryLocale } });
	const options = getDefaultCompilerOptions();
	options.plugins = [wrapped];
	return createVueLanguagePlugin(ts, {}, options, String);
}

function openAndDispose(language, title, expected = title) {
	const file = '/cache-lifecycle.vue';
	const code = language.createVirtualCode(file, 'vue', ts.ScriptSnapshot.fromString(`<script setup lang="ts">const title = $locale.value.sfc.title;</script><locale locale="en">title: ${title}</locale><locale locale="ja">title: JapaneseProject</locale>`), {});
	assert.ok(code);
	const script = [...forEachEmbeddedCode(code)].find(code => code.id === 'script_ts');
	const text = script.snapshot.getText(0, script.snapshot.getLength());
	assert.ok(text.includes(expected), text.slice(0, 1600));
	language.disposeVirtualCode(file);
}

const language = createLanguage('en');
openAndDispose(language, 'BeforeDeletion');
openAndDispose(language, 'AfterRecreation');
const reloaded = createLanguage('ja');
openAndDispose(reloaded, 'EnglishProject', 'JapaneseProject');

// Keep the project alive while releasing one file's ownership.
const project = volarInternals.createVolarProjectCache();

function createFileCache() {
	const owner = {};
	const cache = project.forFile(owner);
	volarInternals.getLocaleDictionary(cache, '<locale locale="en">title: retained</locale>', '/file.vue', [{ name: 'locale_0', type: 'locale', attrs: { locale: 'en' }, content: 'title: retained' }], 'en');
	return new WeakRef(cache);
}

const cacheReference = createFileCache();
for (let attempt = 0; attempt < 5; attempt++) {
	await setImmediate();
	globalThis.gc();
}
assert.ok(irReferences.length > 0);
assert.ok(irReferences.every(reference => reference.deref() === undefined), 'Disposed Vue IR remains reachable.');
assert.equal(cacheReference.deref(), undefined, 'A released file cache remains reachable from the live project.');
assert.equal(project.shared.moduleDictionaries.size, 0);
process.stdout.write('Volar lifecycle: disposed/recreated Vue IR and file cache ownership are released.\n');
