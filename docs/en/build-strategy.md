# Build Strategy

[`buildStrategy`](./configuration.md) controls how locale payloads are reflected in the built bundle.

## `virtual`

The default strategy. Locale modules are loaded through dynamic `import()` calls so [Vite build](https://vite.dev/guide/build.html) can split locale chunks.

## `inline-chunks`

Build-time strategy that duplicates localizable chunks per locale and replaces `$locale` / `$l` references with locale-specific string literals, accessed subtrees, or message formatting expressions.

Each locale, including the primary locale, is emitted as a locale-specific chunk such as `*.ja-JP.js` or `*.en-US.js`. The HTML entry script is replaced with a `*.i18n-loader.js` loader, which reads the `locale` query parameter and imports the matching locale chunk. When `locale` is missing or unsupported, the loader imports the primary locale chunk.

The rewritten `<script>` keeps existing attributes such as `nonce`, `crossorigin`, and `referrerpolicy`. When the original entry script has `integrity`, it is replaced with integrity for the generated loader. The loader verifies the selected locale chunk with `modulepreload` and per-locale chunk integrity before calling `import()`.

### Dictionaries Imported from Vue Files

Static imports of Vue files also support inlining `Messages.$locale.title` and `Messages.$l.count({ n })`. This includes locale-only files, regular components with templates or scripts, and dictionaries declared with `defineInternationalization()`.

Consumers can be Vue scripts/templates or ordinary TS/JS modules. A consumer without its own translations is still transformed with `sfcTransform: 'locale-sources'`. Importing a dictionary does not introduce implicit `$locale` / `$l` bindings in the consumer.

```ts
import Messages from '@/messages.vue';

const title = Messages.$locale.title;
const texts = Messages.$locale;
const read = (key: keyof typeof texts) => texts[key];
const format = Messages.$l.greeting;
```

Static references expand to values or subtrees. Dynamic keys, dictionary aliases, destructuring, and localizer aliases retain the dictionaries or functions needed at runtime. Aliases of the component itself can still use its attached dictionary. Original imports are retained to preserve component side effects, rendering, and styles.

Paths use Vite's resolver, supporting relative/absolute paths and `resolve.alias`. TypeScript `paths` require a matching Vite resolver configuration. Dictionaries in directly imported Vue files are collected even outside the initial scan scope. Type-only imports, `?raw` / `?url`, external and virtual modules are excluded. The optimization does not trace barrel re-exports or dynamic `import()` calls.

### References That Cannot Be Fully Inlined

Static references such as `$locale.sfc.title`, `$locale.env.title`, and `$l.sfc.count({ n })` are replaced with locale-specific string literals or message formatting expressions. References that become dynamic after a static prefix, such as `$locale.env.labels[key]`, embed only the resolved locale-specific subtree and keep a runtime lookup expression. Helper objects that survive static replacement, for example through `unref` or a function argument, retain the locale-specific dictionaries needed at runtime. Objects with no remaining uses can be pruned.

References that cannot be optimized retain a locale-specific object lookup or callable localizer. Missing translations fall back to the primary locale value; if that is also missing, the expression returns a key string such as `$locale.sfc.missingKey`. JavaScript that cannot be parsed during replacement fails the build instead of being left silently unprocessed.

This strategy increases the number of output files and the total delivery size in proportion to the number of locales. Prefer `virtual` when the application has many locales.

Related API:

- [`VueInternationalizationOptions`](../api.md#vueinternationalizationoptions)
- [`vueInternationalization()`](../api.md#vueinternationalization)
- [`createInternationalization()`](../api.md#createinternationalization)
