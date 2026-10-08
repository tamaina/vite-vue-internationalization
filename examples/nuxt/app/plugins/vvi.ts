import { createInternationalization, locales, primaryLocale } from 'virtual:vite-vue-internationalization';

export default defineNuxtPlugin(async (nuxtApp) => {
	// Nuxt serializes this request-local value into its hydration payload.
	const initialLocale = useState<string>('vvi-locale', () => {
		const queryLocale = useRequestURL().searchParams.get('locale');
		return queryLocale && locales.includes(queryLocale) ? queryLocale : primaryLocale;
	});
	if (!locales.includes(initialLocale.value)) throw new Error('Unsupported VVI hydration locale.');
	const internationalization = createInternationalization({ initialLocale: initialLocale.value });
	useHead({ htmlAttrs: { lang: initialLocale.value } });

	nuxtApp.vueApp.use(internationalization);
	await internationalization.ready;
});
