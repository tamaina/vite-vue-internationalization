# Stabilization implementation progress

Base: develop `f8af2c5`. Requested scope: #40, #41, #47, #48, #53,
#43, #44, #42, #46, #39, #49, #13, #50, #14, #45 and roadmap #51.
No issue has been closed or posted to. Work is local until the acceptance evidence
and reviewable changes are ready.

## First increment (2026-09-12)

- #40: production Vite server/client build + Chromium hydration fixture, and
  published dist / require-export vue-tsc fixture. Both wired to CI.
- #41: query guard preserves dictionaries and prevents CSS setup injection.
  Regression failed in both sfcTransform modes before the fix. All Vue block
  queries, raw/url, harmless query and actual dictionary removal covered.
  Production virtual build with scoped CSS renders correctly. Inline build and
  actual development CSS update still need coverage.
- #45: messageSyntax passed to both localizerScopeType branches. Real vue-tsc
  checks valid and missing ICU arguments in script/template, SFC/env, documented
  and compact modes. Number/select covered; expand plural coverage.
- #47: explicit instances accepted by all dictionary/localizer/formatter helpers.
  Server install does not set global fallback. Existing explicit global setter
  remains compatibility opt-in; docs forbid concurrent SSR use. Barrier-controlled
  renderToString test checks crossed requests, static proxies and number format.
  Expand date and framework acceptance coverage.
- #48: ready rejects, pending per-instance locale promises shared, failures cleared
  for retry, malformed bundle shapes rejected. Tests and migration docs added.
- #53 A: data-vvi-locale validated and preferred over URL in generated runtime.
  Production virtual hydration preserves the original DOM node/text, events work,
  scoped CSS loads; unsupported handoff and richer corpus coverage still needed.

Validation: Node 24.18.0, pnpm 11.3.0, installed Vitest 4.1.7.
Baseline: 4 files / 98 tests passed. Current: 6 files / 105 tests passed.
Typecheck and build pass. Lint passes with 5 warnings (runtime defensive shape
checks and existing Volar mapping checks). Real vue-tsc passes both modes with
four expected missing-argument errors each. Production SSR/client Chromium check
passes. CI configuration is local, not remotely executed yet.

## Remaining sequence

Finish Core acceptance coverage, then #43 semantics, #44 output hashes/assets,
#53 B environment isolation and locale asset resolver/SSR manifest/preload;
#42 HMR; #46 AST/scope/maps; #39 original Volar bug; #49 cache measurement;
#13 external editor diagnostics; #50 comparative performance prototype and decision;
#14 highlighting. #40 fixtures expand alongside each fix. #51 must only close
when its requirements are actually met. No benchmark winner selected.

Issue bodies retrieved with gh into /tmp/vvi-issues/all.json (local scratch),
#53 fetched separately. All source links refer to base commit; inspect actual
implementation and issue acceptance conditions before closing anything.

## Second increment: message parity and mixed hydration

- #43: inline ICU now uses the runtime formatter via a bundled emitted formatter
  entry. Unit corpus compares returned value/type and errors for adjacent numeric
  arguments, number/currency skeleton, date/time styles and skeletons, select,
  ordinal, plural offset/pound, missing arguments and invalid messages.
- Vue inline follows numeric-first/explicit-second plural selection, stringifies
  interpolation pieces, evaluates only the selected plural branch, and preserves
  values/plural evaluation order (including static messages). Message functions
  normalize numeric arguments like runtime. Dynamic missing localizer keys use
  the same fallback path; raw dynamic dictionary access does not format ICU.
- String-shape assertions affected by the new generator were replaced with
  executable output assertions. There are 31 additional parity tests.
- #53 B early fixture: production server virtual + client inline hydrates ICU
  number/currency/date/ordinal/offset/select examples with unchanged server text.
  Vue and ICU each pass virtual/virtual and virtual/inline browser runs.
- Mixed scoped CSS initially failed (computed button color black). Vue's
  production default scope ID includes transformed source. Official mixed
  integration now documents vue features.componentIdGenerator='filepath' and a
  common root. The fixture uses this and verifies scoped CSS, existing DOM node,
  text and click behavior in all four configurations. Custom generators must
  also be identical between builds. This is not yet full Phase B acceptance.
- CI adds the other three SSR combinations. The inline fixture selects an entry
  through the current Vite manifest extension; the general asset resolver and
  environment-isolation work remain.

Still audit #43 bare/localizer object and scalar dictionary behavior, nested
linked locale formatting and broader real-build negative cases before closing.
#44 next: current inline reference-map code still globally replaceAlls filenames
and lacks translation digest in augmentChunkHash. No hash correctness claim yet.
Remote CI/framework examples, full Core acceptance and remaining roadmap issues
continue to be outstanding. No issues closed and no push/PR yet.

## Third increment: output hashes and relative delivery

- #44: augmentChunkHash includes a deterministic digest of all collected locale
  payloads, primary locale and syntax, including function sources. This is a
  conservative all-chunk invalidation policy, not a minimal per-locale hash claim.
- Import/export/dynamic-import rewriting uses AST source nodes. Ordinary filenames
  in strings/arrays remain unchanged, and an unrelated chunk containing a filename
  is no longer unnecessarily localized. Recognized preload dependency arrays are
  rewritten as references. Regression tests execute the generated code.
- New `pnpm test:inline-hash` fixture builds A, changes only non-primary translation
  for B, repeats B for C. It requires no same-URL/different-JS output, byte-identical
  B/C, valid manifest paths and SRI, and runs two entries + lazy JS/scoped CSS on
  Chromium with A assets retained alongside B. It uses relative base './'.
- The browser fixture caught two pre-existing relative URL bugs: entry loader
  imported assets/assets/...; then the Vite lazy preload did the same for JS/CSS.
  Loader URLs now resolve relative to import.meta.url and lazy preload paths are
  relative to the importing chunk for relative-base builds.
- Passing fixture reports 10 new JS URLs and 4 validated SRI values. Baseline with
  hash augmentation disabled is tested separately to establish sensitivity.
- CI includes the new fixture. More Phase B work remains: environment isolation,
  general locale asset resolver, SSR manifest/module mapping, nested HTML paths,
  preload metadata for the emitted ICU helper and framework validation.

## Fourth increment: environment-aware SSR assets and translation HMR

- #53: plugin state is keyed by Vite environment, with consumer=server forcing
  virtual output. A same-instance client/edge builder and an interleaved-hook
  regression verify dictionary isolation without relying on environment names.
- Added the dependency-free `vite-vue-internationalization/ssr` resolver and
  `.vite/internationalization-manifest.json`. Locale entries, static dependencies,
  used lazy modules, CSS and integrity are resolved together; native Vite SSR
  manifest module fallback is exercised by the real browser fixture.
- SRI is finalized from written bytes. The browser caught Vite changing shared
  chunk bytes after generateBundle; direct entry and preload integrity now pass.
  Inline formatter imports are included only in the actual importing chunks.
- SSR Vue/ICU fixtures cover both locales, global dictionaries, primary fallback,
  lazy components and scoped CSS, concurrent renders, contradictory URL locale,
  unsupported handoff and wrong inline entry rejection. Relative-base ICU mixed
  output also hydrates on a nested deployment route. Explicit date formatting is
  covered in the request-isolation unit test.
- Same-process client/server builds run sequentially: plugin-vue 6.0.7 has a
  module-global SFC descriptor cache and concurrent strategy builds contaminated
  descriptors in the experiment. Documentation records sequential builds or
  separate processes, as well as the shared filepath component ID requirement.
- #42: environment-local hotUpdate handles SFC and configured global changes,
  including outside-root paths and glob add/delete, invalidates runtime/locale
  modules on server and client, and reloads clients only for dictionary changes.
  CSS-only updates retain Vue HMR. Malformed dictionary overlay recovers without
  restarting the server, including when the corrected dictionary is unchanged.
- Real HMR fixture covers both strategies and both SFC transform modes. External
  YAML edits also refresh a cached ssrLoadModule result. raw/url SFC imports are
  included. Its distinct malformed/corrected saves are separated by 75ms to avoid
  Chokidar's 50ms same-path change-event throttle.

Validation: 10 files / 142 tests pass; typecheck, build and lint pass (7 warnings,
0 errors). All four SSR combinations and all four HMR combinations passed during
implementation. After final script changes, inline/all HMR, relative ICU mixed SSR
(with entry SRI), and real vue-tsc passed again. Hash fixture still passes with
10 new JS URLs and 4 SRI values; disabling augmentation makes its baseline fail.

Remaining: custom manifest paths, removed CSS-only output chunks, nested HTML
asset cases and framework integrations still require audit before full #44/#53
acceptance. AST/scope/maps, original Volar symptom and cache measurements, external
editor diagnostics, delivery benchmark/prototype and highlighting remain open.
No remote CI, issue closure, push or PR has been performed yet.

## Fifth increment, part 1: script binding detection (#46)

- Replaced whole-SFC regex declaration checks with TypeScript script AST binding
  checks. Comments, literals, nested functions, renamed-away imports and type-only
  imports no longer suppress generated bindings. Destructuring, default/namespace
  imports, runtime declarations and block-contained hoisted var are recognized.
- Added 15 focused cases: the original implementation failed 11 of the first 12.
  Updated fixtures contain misleading declarations in comments; production Vue
  virtual and ICU mixed relative SSR still hydrate successfully.
- Parsing/plugin tests pass (90 before the final three scope cases), final parse
  tests pass (35); typecheck and targeted lint pass. Template AST and source maps
  are still pending, so this does not complete #46.

## Fifth increment, part 2: template reference boundaries (#46)

- Locale/localizer template rewriting now gates matches through Vue expression
  ranges and Oxc identifier/scope analysis. Plain text, fixed attributes, string
  literals, member property names, arrow parameters and user setup bindings are
  preserved. v-for/slot-bound names are conservatively excluded.
- Added regression cases and the original literal example to production SSR
  fixtures. 159 tests, typecheck, targeted lint and build pass. Vue mixed and ICU
  mixed relative browser hydration preserve both literal text and literal
  interpolation, with explicit assertions.
- This is an incremental boundary fix, not complete #46: component-import access
  still has regex paths; unsupported expression handling, exact destructured
  template binding analysis, nested rewrite composition and source maps remain.

#39 evidence: downloaded and inspected the original attachment successfully at
https://github.com/user-attachments/assets/4e5b2099-7ebe-4b69-a72b-b7db1877f21c
(local scratch /tmp/vvi-issue39.png). It shows frontend-embed EmNotes.vue with
script setup TypeScript, withDefaults(defineProps<...>), useTemplateRef,
defineExpose, scoped slot/v-for and global $locale.env.noNotes. No diagnostic
message or version is visible. Asked the user for the actual observed symptom;
do not infer a specific diagnostic or confirmed cause from this screenshot.
