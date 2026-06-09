# Getting Started

This page covers the minimum setup. See [Configuration](./configuration.md) for options, [Messages](./messages.md) for dictionary placement, [Message Syntax](./message-syntax.md) for message formatting, and [API Reference](../api.md) for generated API types.

VVI targets Vite 8 and newer, and requires Node.js `^20.19.0 || >=22.12.0`.

## Vite plugin

```ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { vueInternationalization } from 'vite-vue-internationalization';

export default defineConfig({
  plugins: [
    vueInternationalization(),
    vue(),
  ],
});
```

When [`vueInternationalization()`](../api.md#vueinternationalization) is called without options, the plugin reads the matching `vite-vue-internationalization/volar` entry from `vueCompilerOptions.plugins` in the Vite root `tsconfig.json`. See [Configuration](./configuration.md) for the shared config shape.

## Basic configuration

Choose the `primaryLocale` used for type generation and the project-wide message syntax (`messageSyntax`). Configure them in the Vite root `tsconfig.json` so VS Code and `vue-tsc` can use the same settings.

```json
{
  "vueCompilerOptions": {
    "plugins": [
      {
        "name": "vite-vue-internationalization/volar",
        "primaryLocale": "en-US",
        "messageSyntax": "vue"
      }
    ]
  }
}
```

`messageSyntax` can be `vue` or `icu`. Use `vue` for the lightweight Vue I18n-compatible syntax, or `icu` for FormatJS ICU Message syntax. See [Message Syntax](./message-syntax.md) for the supported syntax.

## Type declaration

```ts
/// <reference types="vite-vue-internationalization/virtual" />
```

This enables the generated [`virtual:vite-vue-internationalization`](../api.md#virtual) module types.

## Vue app

```ts
import { createApp } from 'vue';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';

const app = createApp(App);
const internationalization = createInternationalization();

app.use(internationalization);
await internationalization.ready;
app.mount('#app');
```

[`createInternationalization()`](../api.md#createinternationalization) creates the runtime instance with generated locale loaders.

You may import `virtual:vite-vue-internationalization` from app `.ts` modules as well as Vue SFCs. Use this virtual module to share `createInternationalization()`, `currentLocale`, `primaryLocale`, and other generated runtime exports across app code.

## Plain TypeScript modules

Plain `.ts` modules do not receive implicit `$locale` or `$l` bindings. Import `useLocale()` and `useLocalizer()` from the virtual module when you need the same runtime access:

```ts
import { useLocale, useLocalizer } from 'virtual:vite-vue-internationalization';

export function useAppMessages() {
  const $locale = useLocale(import.meta.url);
  const $l = useLocalizer(import.meta.url);

  return {
    appName: () => $locale.value.env.appName,
    greeting: (name: string) => $l.value.env.greeting({ name }),
  };
}
```

Call these helpers after `app.use(createInternationalization())`, such as inside Vue setup code or functions called from it. In plain `.ts` modules, `sfc` points at the module id passed to `useLocale()` / `useLocalizer()`; for app-wide dictionaries, prefer `env`.

Plain `.ts` files cannot declare local dictionaries for VVI to collect. When you want a local dictionary that is separate from a component, prefer a [locale-only SFC](./messages.md#locale-only-sfc) and import it from app code.

Next:

- Configure global dictionaries in [Configuration](./configuration.md)
- Organize `<locale>` blocks and locale-only SFCs in [Messages](./messages.md)
- Choose a message format in [Message Syntax](./message-syntax.md)
- Review runtime helpers in [API Reference](../api.md)
