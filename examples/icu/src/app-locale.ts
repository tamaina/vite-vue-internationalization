import { createInternationalization, currentLocale, primaryLocale } from 'virtual:vite-vue-internationalization';

export { currentLocale, primaryLocale };

export function createAppInternationalization() {
	return createInternationalization();
}
