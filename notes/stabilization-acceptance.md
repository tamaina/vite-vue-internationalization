# Stabilization acceptance record

Base: `develop` / `f8af2c5`. Implementation branch: `fix/ssr-stabilization`.
This records local evidence; it is not an assertion that GitHub issues have been
closed, remote CI has run, or a package/extension has been published.

| Issue | Implemented result | Regression evidence |
| --- | --- | --- |
| #40 | Production Vite/browser, vue-tsc, HMR, map, rebuild and editor fixtures wired into CI | `scripts/test-*.mjs`, `test/examples-smoke.spec.ts`, `.github/workflows/ci.yml` |
| #41 | Vue block/raw/url subrequests excluded from dictionary collection and setup injection | `test/plugin.test.ts`, `scripts/test-hmr.mjs`, SSR builds |
| #47 | Request-local instance resolution and explicit helper/static/formatter instance paths | Barrier-controlled `test/runtime-ssr.test.ts`; concurrent framework requests |
| #48 | Initial failure rejects; concurrent loads share one promise per instance; failed loads retry | `test/runtime-ssr.test.ts`, `test/runtime.test.ts` |
| #53 A | Virtual server/client hydration and validated server locale handoff | `scripts/test-ssr.mjs`; Nuxt payload handoff preserves DOM/text and events |
| #43 | Shared ICU formatter and aligned Vue plural, linked, fallback, raw values and argument evaluation | 42-case `test/message-parity.test.ts`; Vue/ICU production hydration |
| #44 | Translation hashes, final-byte SRI, AST asset references, custom manifests and nested HTML relative URLs | Three builds with old assets retained; `scripts/test-inline-hash.mjs` |
| #53 B | Environment-local builds; locale JS/CSS/preload resolver; Vite SSR manifest and CSS-only modules | Both strategies, two locales, lazy components, CSS, relative base, custom manifest fixture |
| #53 C | Workers HTML-only boundary; Nuxt virtual SSR/hydration; independent Vite/Node mixed fixture | `pnpm examples:smoke` and `pnpm test:ssr`; Nuxt inline integration boundary below |
| #42 | Translation edits invalidate both environments; add/unlink, invalid-to-valid recovery; ordinary CSS HMR preserved | `scripts/test-hmr.mjs`, both strategies and both SFC transform modes |
| #46 | AST expression/binding boundaries; declaration-based chunk scopes; composed source maps with retained argument spans | Literal/shadowing/dynamic/nested tests; real Vite SSR stack and four production map modes |
| #45 | ICU syntax reaches both Volar documentation branches | Actual vue-tsc accepts number/plural/select calls and rejects six missing/wrong-key calls per mode |
| #49 | Latest-file caches, bounded shared caches and project/file disposal | `scripts/test-volar-cache-lifecycle.mjs`, cache benchmarks under `notes/benchmarks/` |
| #13 | External dictionary diagnostics in a separate VS Code extension; buffer/file/glob/config invalidation | Actual extension-host dirty/fix/add/unlink/config/multi-project tests |
| #14 | Message highlighting restricted to values in SFC locale blocks | Shared lexer/range tests and actual VS Code decoration updates |
| #50 | Comparable virtual/inline/route-prototype benchmark and explicit non-adoption decision | `notes/delivery-granularity-design.md`, raw input/source/version/timing/byte evidence |
| #39 | Generated-code adapter failures are observable; supported type-injection paths tested | Original screenshot symptom is still unidentified; **not resolved** |
| #51 | Implementation and acceptance evidence assembled | Remains open while #39 lacks its required reproduction |

## Compatibility and integration boundaries

- Each server request creates its own app, VVI instance and render context.
  `ready` rejects; callers must handle it before render/mount. Outside injection,
  pass the request instance explicitly. See both backend-rendering guides.
- Mixed scoped CSS requires the same project root and filepath-based Vue component
  IDs. With Vue plugin 6, build the differently transformed environments
  sequentially in one process, or use separate processes.
- The Workers example generates HTML only and sends no email. Its local Workers
  runtime is tested; cloud deployment was not requested or performed.
- The Nuxt example uses virtual/virtual. A Nuxt/Nitro adapter must integrate its
  HTML, client manifest, preload and route assets before inline-chunks is supported
  there. The independent mixed fixture does not imply Nuxt inline support.
- Source maps retain exact VVI source spans and compose upstream maps. Vue's own
  template maps may resolve an inner column to the expression boundary; VVI does
  not claim to recover detail absent from the upstream map.
- Vue Language Tools/vue-tsc 3.3.1 is the tested combination. Unsupported generated
  shapes produce a bounded warning instead of silently claiming successful type
  injection. The extension was tested in VS Code 1.95.3 and packaged locally.
- Route-granularity delivery remains a benchmark prototype. Its large-dictionary
  byte savings do not justify changing the public API/default without the SSR,
  HMR, switching and dependency work recorded in the design memo.

## Required information for #39

The original image shows `EmNotes.vue` using script setup, props/defaults,
`useTemplateRef`, `defineExpose`, slots/v-for and `$locale.env.noNotes`. It does not
show a diagnostic or dependency versions. The actual wrong behavior, the expected
result, and the relevant VVI/Vue/TypeScript/Vue Language Tools versions are needed
to identify a reproducer. The adapter/cache/ICU fixes must not be substituted for
the original report's required failing and passing test.

## Release handling

No version bump or publishing is part of this branch. Include the documented
runtime/fallback corrections in the next reviewed stabilization release. Inline
output salt v7 prevents reuse of old URLs for the changed output. The chronological
investigation and failing-before-fix observations are in
`issue-roadmap-progress.md`; final verification results are recorded there.
