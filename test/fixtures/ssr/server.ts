import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';
import type { SSRContext } from 'vue/server-renderer';

export async function render(locale: string) {
	const app = createSSRApp(App);
	const internationalization = createInternationalization({ initialLocale: locale });
	app.use(internationalization);
	await internationalization.ready;
	const context: SSRContext = {};
	const html = await renderToString(app, context);
	return { html, modules: context.modules as Set<string> };
}
