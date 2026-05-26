import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
	testDir: 'test',
	testMatch: /examples-smoke\.spec\.ts/u,
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},
	use: {
		trace: 'on-first-retry',
	},
	webServer: [
		{
			command: 'pnpm --filter ./examples/vue dev -- --port 5173 --strictPort',
			url: 'http://127.0.0.1:5173/',
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: 'pnpm --filter ./examples/icu dev -- --port 5174 --strictPort',
			url: 'http://127.0.0.1:5174/',
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: 'pnpm --filter ./examples/vue exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
			url: 'http://127.0.0.1:4173/',
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: 'pnpm --filter ./examples/icu exec vite preview --host 127.0.0.1 --port 4174 --strictPort',
			url: 'http://127.0.0.1:4174/',
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: 'pnpm --filter ./examples/cloudflare-worker-ssr exec vite preview --host 127.0.0.1 --port 4175 --strictPort',
			url: 'http://127.0.0.1:4175/',
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: 'NUXT_BUILD_DIR=.nuxt-dev pnpm --filter ./examples/nuxt exec nuxt dev --host 127.0.0.1 --port 3005',
			url: 'http://127.0.0.1:3005/',
			reuseExistingServer: !isCI,
			timeout: 60_000,
		},
		{
			command: 'NUXT_BUILD_DIR=.nuxt-preview pnpm --filter ./examples/nuxt exec nuxt preview -p 3006',
			url: 'http://127.0.0.1:3006/',
			reuseExistingServer: !isCI,
			timeout: 60_000,
		},
	],
});
