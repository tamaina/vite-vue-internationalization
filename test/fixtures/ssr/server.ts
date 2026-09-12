import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';

export async function render(locale: string) {
	const app = createSSRApp(App);
	const internationalization = createInternationalization({ initialLocale: locale });
	app.use(internationalization);
	await internationalization.ready;
	return renderToString(app);
}
