# HTML-only rendering on Cloudflare Workers

This example builds a Vue app inside the Workers Vite environment and returns an
HTML document, for uses such as email rendering. Each request creates its own Vue
app and VVI instance, selects an allowed locale, and awaits `ready` before rendering.
It emits no client JavaScript and does not hydrate. It does not send email.

From the repository root:

```sh
pnpm build
pnpm --filter ./examples/cloudflare-worker-ssr build
pnpm --filter ./examples/cloudflare-worker-ssr preview
```

Use `?locale=ja-JP` or `?locale=en-US`. The sample also accepts a simple
`Accept-Language` list; a production application's preference/quality policy
belongs in `resolveRequestLocale`.

`pnpm examples:smoke` checks localized HTML and concurrent requests in the local
Workers runtime. Real client hydration, CSS and preload resolution are tested
separately by `pnpm test:ssr` using `test/fixtures/ssr`, including server `virtual`
with client `virtual` and `inline-chunks`. See
[backend rendering](../../docs/en/backend-rendering.md) for that integration.
