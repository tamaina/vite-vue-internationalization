import { describe, expect, it } from 'vitest';
import { createInlineLocaleMarker, inlineLocaleChunks } from '../src/inline.js';

function compile(source: string) {
	const code = source.replaceAll('MARKER', JSON.stringify(createInlineLocaleMarker('/App.vue')));
	const bundle: Record<string, { type: string; fileName: string; code: string; imports: string[]; dynamicImports: string[] }> = {
		'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', code, imports: [], dynamicImports: [] },
	};
	inlineLocaleChunks(bundle, ['en'], 'en', { '/App.vue': { en: { title: 'Title', nested: { value: 'Nested' }, fn: (value: unknown) => typeof value } } }, { en: { globalTitle: 'Global' } });
	return bundle['assets/app.en.js'].code;
}

describe('inline object references surviving static replacement', () => {
	it('retains Vue unref and escaped aliases, raw functions and missing-key fallback', () => {
		const output = compile('const locale=__VUE_INTERNATIONALIZATION_INLINE_LOCALE__(MARKER); const unref=value=>value; const alias=unref(locale); globalThis.result=[alias.sfc["title"],alias.env["globalTitle"],alias.value.sfc.fn(1),alias.sfc.nested.missing];');
		const scope: { result?: unknown } = {};
		new Function('globalThis', output)(scope);
		expect(scope.result).toEqual(['Title', 'Global', 'number', '$locale.sfc.nested.missing']);
	});
	it('keeps locale objects passed in arguments retained by a localizer replacement', () => {
		for (const reference of ['locale', String.raw`\u006cocale`]) {
			const output = compile(`const locale=__VUE_INTERNATIONALIZATION_INLINE_LOCALE__(MARKER); globalThis.result=__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(MARKER,"sfc.title",((value)=>{globalThis.observed=value.env.globalTitle;return {};} )(${reference}));`);
			const scope: { result?: unknown } = {};
			new Function('globalThis', output)(scope);
			expect(scope).toEqual({ result: 'Title', observed: 'Global' });
		}
	});

	it('still removes dictionary data for a binding whose uses are all statically replaced', () => {
		const output = compile('const locale=__VUE_INTERNATIONALIZATION_INLINE_LOCALE__(MARKER); globalThis.result=locale.sfc.title;');
		expect(output).not.toContain('Global');
		expect(output).not.toContain('Nested');
		const scope: { result?: unknown } = {};
		new Function('globalThis', output)(scope);
		expect(scope.result).toBe('Title');
	});
});
