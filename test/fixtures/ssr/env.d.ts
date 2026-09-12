/// <reference types="vite/client" />
/// <reference types="vite-vue-internationalization/virtual" />
declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent;
	export default component;
}
