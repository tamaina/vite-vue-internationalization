import { expect, test, type Page } from '@playwright/test';

type ExampleCase = {
	name: string;
	url: string;
	heading: string;
	bodyText: string;
	asyncText: string;
};

type WorkerSsrExampleCase = {
	name: string;
	url: string;
	lang: string;
	heading: string;
	bodyText: string;
	footerText: string;
};

type NuxtExampleCase = {
	name: string;
	url: string;
	heading: string;
	greetingText: string;
	bodyText: string;
	countText: string;
};

const examples: ExampleCase[] = [
	{
		name: 'vue dev ja',
		url: 'http://127.0.0.1:5173/',
		heading: 'ほげ',
		bodyText: 'こんにちは vue-i18n',
		asyncText: '非同期コンポーネント',
	},
	{
		name: 'vue dev en',
		url: 'http://127.0.0.1:5173/?locale=en-US',
		heading: 'foo',
		bodyText: 'Hello vue-i18n',
		asyncText: 'Async component',
	},
	{
		name: 'icu dev ja',
		url: 'http://127.0.0.1:5174/',
		heading: 'ほげ',
		bodyText: 'こんにちは ICU',
		asyncText: '非同期コンポーネント',
	},
	{
		name: 'icu dev en',
		url: 'http://127.0.0.1:5174/?locale=en-US',
		heading: 'foo',
		bodyText: 'Hello ICU',
		asyncText: 'Async component',
	},
	{
		name: 'vue preview ja',
		url: 'http://127.0.0.1:4173/',
		heading: 'ほげ',
		bodyText: 'こんにちは vue-i18n',
		asyncText: '非同期コンポーネント',
	},
	{
		name: 'vue preview en',
		url: 'http://127.0.0.1:4173/?locale=en-US',
		heading: 'foo',
		bodyText: 'Hello vue-i18n',
		asyncText: 'Async component',
	},
	{
		name: 'icu preview ja',
		url: 'http://127.0.0.1:4174/',
		heading: 'ほげ',
		bodyText: 'こんにちは ICU',
		asyncText: '非同期コンポーネント',
	},
	{
		name: 'icu preview en',
		url: 'http://127.0.0.1:4174/?locale=en-US',
		heading: 'foo',
		bodyText: 'Hello ICU',
		asyncText: 'Async component',
	},
];

const nuxtExamples: NuxtExampleCase[] = [
	{
		name: 'nuxt dev ja',
		url: 'http://127.0.0.1:3005/?locale=ja-JP',
		heading: 'Nuxt で VVI',
		greetingText: 'こんにちは VVI',
		bodyText: 'Nuxt の Vite plugin 設定から Vue SFC の翻訳を読み込んでいます。',
		countText: '項目が 3 件あります',
	},
	{
		name: 'nuxt dev en',
		url: 'http://127.0.0.1:3005/?locale=en-US',
		heading: 'VVI with Nuxt',
		greetingText: 'Hello VVI',
		bodyText: 'Vue SFC translations are loaded through Nuxt\'s Vite plugin configuration.',
		countText: '3 items',
	},
	{
		name: 'nuxt preview ja',
		url: 'http://127.0.0.1:3006/?locale=ja-JP',
		heading: 'Nuxt で VVI',
		greetingText: 'こんにちは VVI',
		bodyText: 'Nuxt の Vite plugin 設定から Vue SFC の翻訳を読み込んでいます。',
		countText: '項目が 3 件あります',
	},
	{
		name: 'nuxt preview en',
		url: 'http://127.0.0.1:3006/?locale=en-US',
		heading: 'VVI with Nuxt',
		greetingText: 'Hello VVI',
		bodyText: 'Vue SFC translations are loaded through Nuxt\'s Vite plugin configuration.',
		countText: '3 items',
	},
];

const workerSsrExamples: WorkerSsrExampleCase[] = [
	{
		name: 'cloudflare worker ssr ja',
		url: 'http://127.0.0.1:4175/?locale=ja-JP',
		lang: 'ja-JP',
		heading: 'バックエンドで描画したメール',
		bodyText: 'Vite の SSR module graph で Vue SFC の翻訳を読み込んでいます。',
		footerText: 'Cloudflare Workers から送信できます。',
	},
	{
		name: 'cloudflare worker ssr en',
		url: 'http://127.0.0.1:4175/?locale=en-US',
		lang: 'en-US',
		heading: 'Email rendered on the backend',
		bodyText: 'Vue SFC translations are loaded through the Vite SSR module graph.',
		footerText: 'Ready to send from Cloudflare Workers.',
	},
];

for (const example of examples) {
	test(`${example.name} renders localized content`, async ({ page }) => {
		const problems = collectPageProblems(page);

		await page.goto(example.url, { waitUntil: 'networkidle' });

		await expect(page.locator('#app')).not.toBeEmpty();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(example.heading);
		await expect(page.getByText(example.bodyText, { exact: true })).toBeVisible();
		await expect(page.getByText(example.asyncText, { exact: true })).toBeVisible();

		expect(problems).toEqual([]);
	});
}

for (const example of nuxtExamples) {
	test(`${example.name} renders localized content`, async ({ page }) => {
		const problems = collectPageProblems(page);

		await page.goto(example.url, { waitUntil: 'networkidle' });

		await expect(page.locator('#__nuxt')).not.toBeEmpty();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(example.heading);
		await expect(page.getByText(example.greetingText, { exact: true })).toBeVisible();
		await expect(page.getByText(example.bodyText, { exact: true })).toBeVisible();
		await expect(page.getByText(example.countText, { exact: true })).toBeVisible();
		await page.getByRole('button', { name: '+1', exact: true }).click();
		await expect(page.getByTestId('count')).toHaveText(example.url.includes('en-US') ? '4 items' : '項目が 4 件あります');

		expect(problems).toEqual([]);
	});
}

// Response interception changes Chromium's network-address-space classification;
// use production for this case so it does not interfere with dev HMR WebSockets.
for (const port of [3006]) {
	test(`nuxt ${port} hydrates the server locale even if the browser URL changes`, async ({ page }) => {
		const problems = collectPageProblems(page);
		await page.route(`http://127.0.0.1:${port}/?locale=en-US`, async (route) => {
			const response = await route.fetch();
			const html = await response.text();
			expect(html).toContain('VVI with Nuxt');
			await route.fulfill({ response, body: html.replace('</body>', `<script>
window.__vviSsrHeading = document.querySelector('h1');
window.__vviSsrText = window.__vviSsrHeading.firstChild;
history.replaceState(null, '', '/?locale=ja-JP');
</script></body>`) });
		});
		await page.goto(`http://127.0.0.1:${port}/?locale=en-US`, { waitUntil: 'networkidle' });
		await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('VVI with Nuxt');
		expect(await page.evaluate(() => {
			const state = window as unknown as { __vviSsrHeading: Node; __vviSsrText: Node };
			return state.__vviSsrHeading === document.querySelector('h1') && state.__vviSsrText === document.querySelector('h1')?.firstChild;
		})).toBe(true);
		await page.getByRole('button', { name: '+1', exact: true }).click();
		await expect(page.getByTestId('count')).toHaveText('4 items');
		expect(problems).toEqual([]);
	});
}

for (const port of [3005, 3006, 4175]) {
	test(`SSR ${port} keeps concurrent locale responses separate`, async ({ request }) => {
		await Promise.all(Array.from({ length: 12 }, async (_, index) => {
			const locale = index % 2 ? 'en-US' : 'ja-JP';
			const response = await request.get(`http://127.0.0.1:${port}/?locale=${locale}`);
			expect(response.ok()).toBe(true);
			const html = await response.text();
			const expected = port === 4175
				? locale === 'en-US' ? 'Email rendered on the backend' : 'バックエンドで描画したメール'
				: locale === 'en-US' ? 'VVI with Nuxt' : 'Nuxt で VVI';
			expect(html).toMatch(new RegExp(`<html[^>]*lang="${locale}"`));
			expect(html).toContain(expected);
			if (port === 4175) expect(html).not.toContain('<script');
		}));
	});
}

for (const example of workerSsrExamples) {
	test(`${example.name} renders localized html`, async ({ page }) => {
		const problems = collectPageProblems(page);

		await page.goto(example.url, { waitUntil: 'networkidle' });

		await expect(page.locator('html')).toHaveAttribute('lang', example.lang);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(example.heading);
		await expect(page.getByText(example.bodyText, { exact: true })).toBeVisible();
		await expect(page.getByText(example.footerText, { exact: true })).toBeVisible();
		await expect(page.locator('#app')).toHaveCount(0);

		expect(problems).toEqual([]);
	});
}

function collectPageProblems(page: Page): string[] {
	const problems: string[] = [];

	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning' && /hydration/iu.test(message.text())) {
			problems.push(`console error: ${message.text()}`);
		}
	});

	page.on('pageerror', (error) => {
		problems.push(`page error: ${error.message}`);
	});

	page.on('requestfailed', (request) => {
		problems.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
	});

	page.on('response', (response) => {
		if (response.status() >= 400) {
			problems.push(`http ${response.status()}: ${response.url()}`);
		}
	});

	return problems;
}
