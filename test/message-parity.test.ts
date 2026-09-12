import { describe, expect, it } from 'vitest';
import { internals } from '../src/plugin.js';
import { createInlineLocaleMarker } from '../src/inline.js';
import { createInternationalization, formatLocaleMessage, useLocale, useLocalizer } from '../src/runtime.js';

const icuCases = [
	['{a}{b}', { a: 1, b: 2 }],
	['{n, number}', { n: 1234.5 }],
	['{n, number, ::currency/USD}', { n: 12.5 }],
	['{d, date, long} {d, time, short}', { d: 0 }],
	['{d, date, ::yyyyMMdd}', { d: 0 }],
	['{n, plural, offset:1 =0 {Nobody} one {You and one} other {You and #}}', { n: 4 }],
	['{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}', { n: 22 }],
	['{kind, select, yes {{n, number}} other {No}}', { kind: 'yes', n: 1234 }],
	['\'{hello}\' {n}', { n: 2 }],
	['{n, number}', {}],
	['{kind, select, yes {Yes} other {No}}', {}],
	['{n, invalid}', { n: 1 }],
	['{n}', 3],
	['{a}', { a: false }],
] as const;

function outcome(fn: () => unknown) {
	try {
		const value = fn();
		return { value, type: typeof value };
	} catch (error) {
		return { error: (error as Error).message };
	}
}

describe('runtime / inline message semantics', () => {
	it.each(icuCases)('matches ICU %s', async (message, values) => {
		const messages = { message };
		const instance = createInternationalization({ primaryLocale: 'en-US', messageSyntax: 'icu', loaders: {
			'en-US': async () => ({ modules: { '/App.vue': messages } }),
		} });
		await instance.ready;
		const marker = createInlineLocaleMarker('/App.vue');
		const expression = internals.replaceInlineLocalizerAccess(
			`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${JSON.stringify(marker)}, "sfc.message", values)`,
			'en-US', 'en-US', { '/App.vue': { 'en-US': messages } }, {}, 'icu',
		);
		const inline = new Function('__VVI_FORMAT_ICU__', 'values', `return (${expression});`);
		const runtime = useLocalizer('/App.vue', instance).value.sfc.message;
		expect(outcome(() => inline(formatLocaleMessage, values))).toEqual(outcome(() => runtime(values)));
	});
});

const vueCases: Array<[string, unknown, number | undefined]> = [
	['{a}{b}', { a: 1, b: 2 }, undefined],
	['{a}', { a: false }, undefined],
	['{0}{1}', [1, 2], undefined],
	['{n}', 3, undefined],
	['one | {n} many', { n: 3 }, undefined],
	['one | {n} many', { n: 3 }, 3],
	['none | one | {n} many', 3, 1],
	['one | {n} many', undefined, 3],
	['{missing}', {}, undefined],
	['@.upper:name', {}, undefined],
	['@:nestedUpper', {}, undefined],
	['@:twice', {}, undefined],
	['@:plural', { n: 3 }, 3],
	['@:cycle', {}, undefined],
	['{\'literal\'} {n}', { n: null }, undefined],
];

it.each(vueCases)('matches Vue %s / %j / %j', async (message, values, plural) => {
	const messages = { message, name: 'istanbul', plural: 'one | {n} many', cycle: '@:cycle', nestedUpper: '@.upper:name', twice: '@:name @:name' };
	const instance = createInternationalization({ primaryLocale: 'tr', loaders: {
		tr: async () => ({ modules: { '/App.vue': messages } }),
	} });
	await instance.ready;
	const marker = createInlineLocaleMarker('/App.vue');
	const expression = internals.replaceInlineLocalizerAccess(
		`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${JSON.stringify(marker)}, "sfc.message", values, plural)`,
		'tr', 'tr', { '/App.vue': { tr: messages } }, {},
	);
	const inline = new Function('values', 'plural', `return (${expression});`);
	const runtime = useLocalizer('/App.vue', instance).value.sfc.message;
	expect(outcome(() => inline(values, plural))).toEqual(outcome(() => runtime(values as never, plural)));
});

it('evaluates value and plural arguments once, in order, including static messages', () => {
	for (const message of ['Static', 'one | {n} many', '{n}', '@:plural']) {
		const marker = createInlineLocaleMarker('/App.vue');
		const expression = internals.replaceInlineLocalizerAccess(
			`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${JSON.stringify(marker)}, "sfc.message", values(), plural())`,
			'en', 'en', { '/App.vue': { en: { message, plural: 'one | {n} many' } } }, {},
		);
		const calls: string[] = [];
		new Function('values', 'plural', `return (${expression});`)(
			() => { calls.push('values'); return { n: 3 }; },
			() => { calls.push('plural'); return 3; },
		);
		expect(calls).toEqual(['values', 'plural']);
	}
});

it('normalizes numeric arguments for message functions, static and dynamic localizers', async () => {
	const message = (values?: { n?: number }, plural?: number) => `${values?.n}:${plural}`;
	const instance = createInternationalization({ primaryLocale: 'en', loaders: { en: async () => ({ modules: { '/App.vue': { message } } }) } });
	await instance.ready;
	const runtime = useLocalizer('/App.vue', instance).value.sfc.message;
	for (const key of ['message', '[key]']) {
		const expression = internals.replaceInlineLocalizerAccess(
			`const l = __VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))}); const result = l.sfc${key.startsWith('[') ? key : `.${key}`}(3, 1);`,
			'en', 'en', { '/App.vue': { en: { message } } }, {},
		);
		const inline = new Function('key', `${expression.replace(/^const l = [^;]+;/, '')}; return result;`);
		expect(inline('message')).toBe(runtime(3, 1));
	}
});

it('keeps dynamic missing-key fallback and argument side effects', async () => {
	const instance = createInternationalization({ primaryLocale: 'en', loaders: { en: async () => ({ modules: { '/App.vue': { group: { known: 'Known' } } } }) } });
	await instance.ready;
	const code = `const l = __VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))}); const result = l.sfc.group[key()](values(), plural());`;
	const replaced = internals.replaceInlineLocalizerAccess(code, 'en', 'en', { '/App.vue': { en: { group: { known: 'Known' } } } }, {});
	const calls: string[] = [];
	const result = new Function('key', 'values', 'plural', `${replaced.replace(/^const l = [^;]+;/, '')}; return result;`)(
		() => { calls.push('key'); return 'missing'; },
		() => { calls.push('values'); return {}; },
		() => { calls.push('plural'); return 3; },
	);
	expect(calls).toEqual(['key', 'values', 'plural']);
	expect(result).toBe(useLocalizer('/App.vue', instance).value.sfc.group.missing({}, 3));
});

it('returns raw ICU message strings for dynamic dictionary access', () => {
	const code = `const locale = __VUE_INTERNATIONALIZATION_INLINE_LOCALE__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))}); const result = locale.sfc[key];`;
	const replaced = internals.replaceInlineLocaleMarkers(code, 'en', 'en', 'icu', { '/App.vue': { en: { number: '{n, number}' } } }, {});
	const result = new Function('key', `${replaced}; return result;`)('number');
	expect(result).toBe('{n, number}');
});

it.each(['sfc.count()', 'sfc.flag()', 'sfc.missing()', 'sfc.nested.missing()', 'sfc["{name}|other"]()'])('matches bare localizer access %s', async path => {
	const messages = { count: 4, flag: false, nested: { known: 'Known' } };
	const instance = createInternationalization({ primaryLocale: 'en', loaders: { en: async () => ({ modules: { '/App.vue': messages } }) } });
	await instance.ready;
	const expression = internals.replaceInlineLocaleMarkers(`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))})`, 'en', 'en', 'vue', { '/App.vue': { en: messages } }, {});
	const evaluate = new Function('l', `return l.${path};`);
	expect(outcome(() => evaluate(new Function(`return ${expression};`)()))).toEqual(outcome(() => evaluate(useLocalizer('/App.vue', instance).value)));
});

it.each([['missing', ''], ['nested', 'missing']])('preserves raw lookup fallback for %s / %s', (key, suffix) => {
	const expression = internals.replaceInlineLocaleMarkers(`__VUE_INTERNATIONALIZATION_INLINE_LOOKUP__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))},"sfc",key,${JSON.stringify(suffix)})`, 'en', 'en', 'vue', { '/App.vue': { en: { nested: { known: 'Known' } } } }, {});
	expect(new Function('key', `return ${expression};`)(key)).toBe(`$locale.sfc.${[key, suffix].filter(Boolean).join('.')}`);
});

it('preserves explicit raw null and scalar overrides over primary dictionary shapes', async () => {
	const primary = { nullable: 'Primary', scalar: { nested: 'Primary' }, fallback: 'Fallback' };
	const current = { nullable: null, scalar: 4 };
	const instance = createInternationalization({ primaryLocale: 'ja', initialLocale: 'en', loaders: {
		ja: async () => ({ modules: { '/App.vue': primary } }), en: async () => ({ modules: { '/App.vue': current } }),
	} });
	await instance.ready;
	await instance.loadLocale('ja');
	const runtime = useLocale('/App.vue', instance).value.sfc;
	const expression = internals.replaceInlineLocaleMarkers(`__VUE_INTERNATIONALIZATION_INLINE_LOCALE__(${JSON.stringify(createInlineLocaleMarker('/App.vue'))})`, 'en', 'ja', 'vue', { '/App.vue': { ja: primary, en: current } }, {});
	const inline = new Function(`return ${expression};`)().sfc;
	for (const key of ['nullable', 'scalar', 'fallback']) expect(inline[key]).toBe(runtime[key]);
	expect(runtime.nullable).toBeNull();
	expect(runtime.scalar).toBe(4);
});

it('resolves nested inline calls in message-function plural and computed-key arguments', () => {
	const marker = JSON.stringify(createInlineLocaleMarker('/App.vue'));
	const inner = `__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${marker},"sfc.n",{})`;
	const key = `__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${marker},"sfc.which",{})`;
	const expressions = [
		`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${marker},"sfc.fn",{},Number(${inner}))`,
		`__VUE_INTERNATIONALIZATION_INLINE_LOOKUP__(${marker},"sfc",${key},"")`,
	];
	for (const expression of expressions) {
		const replaced = internals.replaceInlineLocaleMarkers(expression, 'en', 'en', 'vue', { '/App.vue': { en: { n: '3', which: 'n', fn: (_values?: unknown, plural?: number) => String(plural) } } }, {});
		expect(new Function(`return ${replaced};`)()).toBe('3');
	}
});
