import { createSSRApp } from 'vue';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';

const internationalization = createInternationalization();
const app = createSSRApp(App);
app.use(internationalization);
await internationalization.ready;
await import('./theme.css');
app.mount('#app');
document.documentElement.dataset.hydrated = 'true';
