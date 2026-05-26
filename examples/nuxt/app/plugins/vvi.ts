import { createInternationalization, locales, primaryLocale } from 'virtual:vite-vue-internationalization';

export default defineNuxtPlugin(async (nuxtApp) => {
	const url = useRequestURL();
	const queryLocale = url.searchParams.get('locale');
	const initialLocale = queryLocale && locales.includes(queryLocale) ? queryLocale : primaryLocale;
	const internationalization = createInternationalization({ initialLocale });

	nuxtApp.vueApp.use(internationalization);
	await internationalization.ready;
});
