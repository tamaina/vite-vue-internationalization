import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createComponentLocale, createComponentLocalizer, createInternationalization, useInternationalization, useLocale, useLocalizer, useNumberFormat } from '../src/runtime.js';

function barrier() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}

describe('SSR runtime ownership', () => {
	it('keeps crossed requests and plain helpers bound to their explicit instance', async () => {
		const paused = barrier();
		const entered = barrier();
		const create = (locale: string) => createInternationalization({ primaryLocale: locale, loaders: {
			[locale]: async () => ({ modules: { '/App.vue': { title: locale } } }),
		} });
		const a = create('ja-JP');
		const b = create('en-US');
		const appA = createSSRApp({ async setup() {
			const injected = useLocale('/App.vue');
			entered.release();
			await paused.promise;
			expect(useInternationalization(a)).toBe(a);
			expect(useLocalizer('/App.vue', a).value.sfc.title()).toBe('ja-JP');
			expect(createComponentLocale('/App.vue', a).title).toBe('ja-JP');
			expect((createComponentLocalizer('/App.vue', a).title as () => string)()).toBe('ja-JP');
			expect(useNumberFormat(a).value(1234.5)).toBe(new Intl.NumberFormat('ja-JP').format(1234.5));
			return () => h('p', injected.value.sfc.title);
		} });
		appA.use(a);
		await a.ready;
		const rendering = renderToString(appA);
		await entered.promise;
		const appB = createSSRApp({ setup() {
			const locale = useLocale('/App.vue');
			return () => h('p', locale.value.sfc.title);
		} });
		appB.use(b);
		await b.ready;
		expect(await renderToString(appB)).toBe('<p>en-US</p>');
		paused.release();
		expect(await rendering).toBe('<p>ja-JP</p>');
		expect(() => useInternationalization()).toThrow('not installed');
	});
});

describe('locale loading failures and sharing', () => {
	it('shares initial and manual loads, propagates failure and allows retry', async () => {
		const gate = barrier();
		const error = new Error('offline');
		const loader = vi.fn().mockImplementationOnce(async () => { await gate.promise; throw error; })
			.mockResolvedValue({ global: { title: 'ready' } });
		const instance = createInternationalization({ primaryLocale: 'en', loaders: { en: loader } });
		const manual = instance.loadLocale('en');
		expect(manual).toBe(instance.ready);
		const results = Promise.allSettled([instance.ready, manual]);
		gate.release();
		expect(await results).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
		expect(loader).toHaveBeenCalledTimes(1);
		await instance.loadLocale('en');
		await instance.loadLocale('en');
		expect(loader).toHaveBeenCalledTimes(2);
		expect(useLocale('', instance).value.env.title).toBe('ready');
		await expect(instance.loadLocale('missing')).rejects.toThrow('not available');
	});

	it('does not share loader state between instances or cache malformed bundles', async () => {
		const loader = vi.fn().mockResolvedValueOnce({ global: [] }).mockResolvedValue({ global: {} });
		const options = { primaryLocale: 'en', loaders: { en: loader } };
		const a = createInternationalization(options);
		await expect(a.ready).rejects.toThrow('Invalid locale dictionary');
		await a.loadLocale('en');
		await createInternationalization(options).ready;
		expect(loader).toHaveBeenCalledTimes(3);
	});
});
