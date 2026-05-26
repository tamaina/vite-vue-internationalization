import { vueInternationalization } from 'vite-vue-internationalization';

export default defineNuxtConfig({
	buildDir: process.env.NUXT_BUILD_DIR ?? '.nuxt',
	compatibilityDate: '2026-05-26',
	devtools: { enabled: false },
	srcDir: 'app',
	vite: {
		plugins: [
			vueInternationalization({
				primaryLocale: 'ja-JP',
				buildStrategy: 'virtual',
				messageSyntax: 'vue',
			}),
		],
	},
});
