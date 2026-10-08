# Nuxt SSR and hydration

This example uses `virtual` in both Nuxt Vite pipelines and Nitro for the server.
The Nuxt plugin creates one VVI instance per app/request. Its `useState` value
contains only the selected locale string, which Nuxt serializes for hydration;
the client does not reselect the locale from its URL. The instance itself is never
serialized or shared between requests. Language links perform a full navigation.

From the repository root, run `pnpm example:nuxt` for development or
`pnpm examples:smoke` for production build and browser verification. The smoke
tests cover Japanese/English concurrent SSR requests, interactive hydration,
preservation of server DOM nodes and locale handoff when the URL changes before
client startup.

This example does not install a Nuxt/Nitro adapter for locale-specific client
assets. Changing only `buildStrategy` to `inline-chunks` is insufficient: Nuxt owns
the HTML entry, client manifest, preload links and route assets. An integration
must route those through the VVI locale asset resolver and use consistent scoped
CSS IDs. The framework-independent mixed-strategy fixture is
`test/fixtures/ssr`, run with `pnpm test:ssr`.
