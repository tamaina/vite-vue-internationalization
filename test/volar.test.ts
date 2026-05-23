import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createParsedCommandLine, createVueLanguagePlugin, forEachEmbeddedCode, getDefaultCompilerOptions } from '@vue/language-core';
import vueInternationalizationVolar from '../src/volar.js';

describe('volar plugin', () => {
	it('can be loaded from vueCompilerOptions.plugins via require export', () => {
		const parsed = createParsedCommandLine(ts, {
			fileExists: ts.sys.fileExists,
			readFile: ts.sys.readFile,
			useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
		}, 'examples/motivation-1/tsconfig.json');

		expect(parsed.vueOptions.plugins.some((plugin) =>
			(plugin as { __moduleConfig?: { name?: string } }).__moduleConfig?.name === 'vue-internationalization/volar',
		)).toBe(true);
	});

	it('injects file-local setup bindings into Vue virtual code', () => {
		const vueCompilerOptions = getDefaultCompilerOptions();
		vueCompilerOptions.plugins = [
			Object.assign(vueInternationalizationVolar, {
				__moduleConfig: {
					name: 'vue-internationalization/volar',
					primaryLocale: 'ja-JP',
					global: {
						'ja-JP': {
							fuga: 'bar',
						},
					},
				},
			}),
		];
		const plugin = createVueLanguagePlugin(ts, {}, vueCompilerOptions, String);
		const fileName = resolve('examples/motivation-1/src/App.vue');
		const source = [
			'<template>{{ $locale.module.hoge }} {{ $locale.global.fuga }}</template>',
			'<script setup lang="ts">',
			'const title = $locale.value.module.hoge;',
			'</script>',
			'<locale locale="ja-JP" lang="yaml">',
			'hoge: ほげ',
			'</locale>',
		].join('\n');
		const root = plugin.createVirtualCode?.(fileName, 'vue', ts.ScriptSnapshot.fromString(source), {} as never);

		if (!root) {
			throw new Error('Expected Vue virtual code to be created.');
		}

		const scriptCode = [...forEachEmbeddedCode(root)]
			.find((code) => code.id === 'script_ts')
			?.snapshot.getText(0, Number.MAX_SAFE_INTEGER);
		const scriptSetupRaw = [...forEachEmbeddedCode(root)]
			.find((code) => code.id === 'scriptsetup_raw')
			?.snapshot.getText(0, Number.MAX_SAFE_INTEGER);

		expect(scriptCode).not.toContain('interface ComponentCustomProperties');
		expect(scriptCode).toContain('declare const $locale: Readonly<import("vue").ComputedRef<import("vue-internationalization/runtime").LocaleScope<{ fuga: string; }, { hoge: string; }>>>');
		expect(scriptCode).toContain('ComponentPublicInstance & { $locale: import("vue-internationalization/runtime").LocaleScope<{ fuga: string; }, { hoge: string; }>; }');
		expect(scriptCode).toContain('__VLS_ctx.$locale.module.hoge');
		expect(scriptSetupRaw?.trim()).toBe('const title = $locale.value.module.hoge;');
	});
});
