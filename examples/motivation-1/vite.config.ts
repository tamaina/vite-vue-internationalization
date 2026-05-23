import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { vueInternationalization } from 'vue-internationalization';

export default defineConfig({
  build: {
    manifest: true
  },
  plugins: [
    vueInternationalization({
      primaryLocale: 'ja-JP',
      buildStrategy: 'inline-chunks',
      global: {
        'ja-JP': './src/locales/ja-JP.yaml',
        'en-US': './src/locales/en-US.yaml'
      }
    }),
    vue()
  ]
});
