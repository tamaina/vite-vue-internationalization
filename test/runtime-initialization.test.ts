import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp } from 'vue';
import { createInternationalization, useInternationalization, useLocale, useLocalizer } from '../src/runtime.js';
import type { LocaleBundle } from '../src/runtime.js';

// Simulate eager imports before the browser app can install its plugin.
const importTimeErrors = [useLocale, useLocalizer].map((helper) => {
	try {
		helper('/src/navigation.ts');
		return undefined;
	} catch (error) {
		return error;
	}
});

afterEach(() => vi.unstubAllGlobals());

describe('runtime initialization contract', () => {
	it('rejects module-scope composable calls without an installed instance', () => {
		for (const error of importTimeErrors) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain('not installed. Call app.use(createInternationalization())');
		}
		expect(() => useInternationalization()).toThrow('not installed');
	});

	it('updates retained refs after ready for both TS and SFC module ids, but not snapshots', async () => {
		vi.stubGlobal('window', {});
		let finishLoading!: (bundle: LocaleBundle) => void;
		const bundle = new Promise<LocaleBundle>((resolve) => { finishLoading = resolve; });
		const instance = createInternationalization({
			primaryLocale: 'en',
			loaders: { en: () => bundle },
		});
		createApp({}).use(instance);

		const tsLocale = useLocale('https://example.test/src/navigation.ts?v=1');
		const tsLocalizer = useLocalizer('https://example.test/src/navigation.ts?v=1');
		const sfcLocale = useLocale('/src/App.vue');
		const sfcLocalizer = useLocalizer('/src/App.vue');
		const title = computed(() => tsLocale.value.env.title);
		const greeting = computed(() => tsLocalizer.value.env.greeting({ name: 'Ada' }));
		const earlyTitle = title.value;
		const earlyEnv = tsLocale.value.env;
		const earlyGreeting = tsLocalizer.value.env.greeting;
		expect(earlyTitle).toBe('$locale.env.title');
		expect(greeting.value).toBe('$locale.env.greeting');
		expect(sfcLocale.value.sfc.title).toBe('$locale.sfc.title');
		expect(sfcLocalizer.value.sfc.title()).toBe('$locale.sfc.title');

		finishLoading({
			global: { title: 'Search', greeting: 'Hello {name}' },
			modules: { '/src/App.vue': { title: 'Component' } },
		});
		await instance.ready;

		expect(title.value).toBe('Search');
		expect(greeting.value).toBe('Hello Ada');
		expect(sfcLocale.value.env.title).toBe('Search');
		expect(sfcLocalizer.value.env.greeting({ name: 'Ada' })).toBe('Hello Ada');
		expect(sfcLocale.value.sfc.title).toBe('Component');
		expect(sfcLocalizer.value.sfc.title()).toBe('Component');
		expect(tsLocale.value.sfc.title).toBe('$locale.sfc.title');
		expect(tsLocalizer.value.sfc.title()).toBe('$locale.sfc.title');
		expect(tsLocale.value.env.missing).toBe('$locale.env.missing');
		expect(tsLocalizer.value.env.missing()).toBe('$locale.env.missing');
		expect(earlyTitle).toBe('$locale.env.title');
		expect(earlyEnv.title).toBe('$locale.env.title');
		expect(earlyGreeting({ name: 'Ada' })).toBe('$locale.env.greeting');
	});
});
