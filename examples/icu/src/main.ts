import { createApp } from 'vue';
import App from './App.vue';
import { createAppInternationalization } from './app-locale.js';

const app = createApp(App);
const internationalization = createAppInternationalization();

app.use(internationalization);
await internationalization.ready;
app.mount('#app');
