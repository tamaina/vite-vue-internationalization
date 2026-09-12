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

## Client assets for SSR

VVI emits `.vite/internationalization-manifest.json` for client builds. The server
can import this JSON as build data and use the runtime-independent
`vite-vue-internationalization/ssr` entry (no Node filesystem or Vue dependency):

```ts
import { resolveLocaleAssets, type LocaleAssetManifest } from 'vite-vue-internationalization/ssr';
import clientManifest from '../dist/client/.vite/internationalization-manifest.json';

const context: import('vue/server-renderer').SSRContext = {};
const html = await renderToString(app, context);
const assets = resolveLocaleAssets(clientManifest as LocaleAssetManifest, {
  locale: internationalization.locale,
  entry: 'src/entry-client.ts',
  modules: context.modules,
});
```

Render `assets.entry.href` as the module script, `assets.stylesheets` as stylesheet
links, and `assets.modulepreload` as modulepreload links. Each asset includes its
output `file`, resolved `href`, and available `integrity`. When using integrity on
modulepreload, add `crossorigin`. Escape attributes with your HTML renderer. The
entry and all preloaded chunks correspond to the selected locale. Unused dynamic
imports are omitted; dynamic components included in the Vue SSR context bring in
their JS and CSS. Cyclic static imports are deduplicated. Unsupported locales,
unknown entries/modules and missing chunk mappings throw before emitting a page.

An optional `ssrManifest` accepts Vite's SSR manifest for additional module IDs.
Its asset references must map to the VVI client graph; unmatched references throw
rather than silently including an asset for another locale. The VVI manifest's
own module map covers the normal Vue SSR context without requiring that option.

For `base: './'` or `base: ''`, supply `assetBaseUrl` as the absolute deployment
root URL, for example `https://example.com/application/`. This is independent of
the current route, so `/application/nested/page` does not change asset resolution.
A `base` override also supports a root-relative prefix or absolute CDN URL.

### Environment builds

`buildStrategy: 'inline-chunks'` selects the client optimization. Environments
whose `config.consumer` is `server` always use `virtual`; their names need not be
`ssr`. VVI keeps collected dictionaries, output hashes, manifests and emitted
formatter references separately for each environment. Client assets are never
emitted by the server pipeline.

Build client and server **sequentially within one Node process** with
`@vitejs/plugin-vue` 6. Its descriptor cache is module-scoped and cannot safely
hold differently transformed versions of the same SFC at the same time. The VVI
fixture uses `createBuilder`, then `await builder.build(client)` followed by
`await builder.build(edge)`, with the same VVI instance and different consumers.
Separate build processes are also an option. This is a Vue-plugin integration
constraint, not a requirement to share request state. Keep the filepath scope-ID
configuration described above in both environments.

The browser locale-selector loader is for client-only pages that select a locale
on navigation. It honors `data-vvi-locale` when provided. For SSR, use the resolver
to link the known locale entry directly. Localized chunks reject a conflicting
`data-vvi-locale`; they do not silently hydrate another language.
