# Backend HTML Rendering

VVI transforms Vue SFCs as a Vite plugin and provides the runtime module through `virtual:vite-vue-internationalization`. In environments that build backend code with Vite plugins, such as Cloudflare Workers, the same module graph can render Vue to an HTML string.

```ts
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';

export default {
  async fetch(request: Request) {
    const locale = new URL(request.url).searchParams.get('locale') ?? 'en-US';
    const app = createSSRApp(App);
    const internationalization = createInternationalization({ initialLocale: locale });

    app.use(internationalization);
    await internationalization.ready;

    return new Response(await renderToString(app), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
```

For SSR, do not share the Vue app created by `createSSRApp()` or the installed VVI instance across requests. The example above creates an instance for each request with the selected locale passed as `initialLocale`, then calls `renderToString()` after `await internationalization.ready`. Locale dictionaries and loader definitions can live in module scope, but sharing the rendering app / instance can mix active locale state between concurrent requests.

`createInternationalization({ initialLocale })` loads only the locale bundle for `initialLocale`; it does not load every locale on every request. In the same Worker isolate, dynamically imported modules are normally cached, so repeated renders for the same locale should also avoid most module resolution cost. If rendering speed becomes a concern, avoid sharing the app / instance as an optimization. Cache request-independent layers instead, such as locale loaders or the final rendered HTML when the output is safe to reuse.

For Cloudflare Workers, register VVI with `@vitejs/plugin-vue` and `@cloudflare/vite-plugin`.

```ts
import { cloudflare } from '@cloudflare/vite-plugin';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { vueInternationalization } from 'vite-vue-internationalization';

export default defineConfig({
  plugins: [
    vueInternationalization(),
    vue(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ],
});
```

`inline-chunks` is an optimization for browser delivery that emits locale-specific chunks. For Workers or email-style backend rendering, start with the default `virtual` strategy.

See `examples/cloudflare-worker-ssr` for a small working example.

For Nuxt, see `examples/nuxt`. That example registers VVI in `vite.plugins` in `nuxt.config.ts`, then installs `createInternationalization({ initialLocale })` into the Vue app from a Nuxt plugin. Nuxt can use Vite as its build tool, but its server runtime is built around Nitro, so it should not be treated as the same setup as the Cloudflare Workers example. For other SSR frameworks, check which layer owns Vite's SFC transform and resolution of `virtual:vite-vue-internationalization`.

## Request-local helpers and load failures

On the server, installing an instance no longer sets an implicit global instance.
Inside setup, helpers use Vue injection. Outside setup (including after an await),
pass the request's instance explicitly:

```ts
const locale = useLocale('/src/App.vue', internationalization);
const localizer = useLocalizer('/src/App.vue', internationalization);
const staticLocale = createComponentLocale('/src/App.vue', internationalization);
const staticLocalizer = createComponentLocalizer('/src/App.vue', internationalization);
const format = useNumberFormat(internationalization);
```

`useInternationalization(instance)` and `useDateTimeFormat(instance)` also accept
an explicit instance. Explicit instances take priority over injection. Without
either, server helpers throw. `setActiveInternationalization()` remains an
explicit compatibility opt-in, but must not be used for concurrent SSR requests.
Browser installations retain their existing outside-setup fallback.

`ready` now rejects if initial loading fails. Catch that error before rendering or
mounting and decide whether to return an error page. It no longer logs and resolves
as if loading succeeded. Concurrent loads of the same locale on one instance share
a promise. Failed loads are removed from the pending cache so an explicit
`loadLocale(locale)` retry can succeed. A retry does not replace the original
`ready` promise; await the retry itself. Different requests never share mutable
load state.

## Locale handoff for hydration

For a `virtual` server and client, emit the selected locale as
`<html lang="en-US" data-vvi-locale="en-US">`. The generated client runtime reads
`data-vvi-locale` before looking at the URL. Unsupported handoff locales throw
instead of silently selecting another locale. Escape attribute values with your
HTML renderer, and select from the supported `locales` list on the server.
Create the client app with `createSSRApp()`, install a new instance, await `ready`,
and then mount the SSR container. Use the same fallback and formatting options on
both sides. Without the attribute, the existing URL/primary-locale selection is
preserved. `currentLocale` is a module-level browser default, not request state;
servers must continue passing `initialLocale` explicitly.

The framework-independent `test/fixtures/ssr` fixture is exercised by
`pnpm test:ssr` with a production client and server build and Chromium hydration.
The Workers example above remains an HTML-only example.

### Scoped CSS with mixed strategies

Use the same project root and configure `@vitejs/plugin-vue` in both builds with
`vue({ features: { componentIdGenerator: 'filepath' } })`. Its production default
includes transformed SFC source in the scope ID. VVI's virtual and inline transforms
produce different source, so the default can give server HTML and client CSS
different IDs. The filepath setting keeps scoped CSS IDs consistent across both
strategies. Custom ID generators must likewise produce the same ID on both sides.
