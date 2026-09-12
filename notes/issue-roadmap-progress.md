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

## Fifth increment, part 3: component references and destructuring (#46)

- Template binding patterns now use TypeScript binding ASTs: aliased property keys
  and default-value strings no longer incorrectly hide a real translation access.
- Locale-only component imports are read from script ASTs, including
  `import { default as Messages }`. Script rewriting is confined to script blocks
  and actual imported references under Oxc scopes. Template component references
  use the same expression/binding boundaries as local locale references.
- Regression cases retain strings, comments, style content, v-for names and
  shadowing function parameters while translating the real imported accesses.
- 161 tests, typecheck and build pass; targeted lint was fixed; Vue mixed and ICU
  relative mixed hydration pass. Source-map work remains the next #46 gate.

## Sixth increment: source-position provenance (#46)

- Added SourceEdits: concrete positional edits compose original UTF-16 offsets;
  retained/moved ranges preserve provenance and synthetic insertions are unmapped.
  No textual diff guesses are used. Subrange transforms fork/adopt tracked ranges.
- Both virtual and inline SFC transforms, setup/component-option insertion,
  locale-block deletion, template/component access and standalone helper rewrites
  now return source maps. Retained localizer arguments and moved default-export
  expressions preserve their original source locations.
- Five mapping tests check original lines/columns and sourcesContent. A real Vite
  SSR exception with block removal and setup injection maps back to the exact
  original SFC line and column using ssrFixStacktrace.
- 166 tests, typecheck, lint (8 warnings, 0 errors), build, Vue mixed and relative
  ICU mixed hydration, and deterministic hash/SRI fixture pass.
- Added scripts/test-source-maps.mjs as a production acceptance probe. Virtual
  output passes. Inline output FAILS: index--pN2Zgtd.en.js maps the exception to
  line 9 instead of original zero-based line 8. It still references the old
  output map after locale-specific code rewrites and added guard/import lines.
  This test is intentionally not wired to CI until repaired; the failure is an
  outstanding #46/#44 gate, not a successful source-map completion claim.
- Next: track applyInlineReplacementPlan, import/preload edits and injected headers
  against each original chunk map; emit a map per localized chunk and rewrite its
  sourceMappingURL, then validate both locale maps in the production probe.

## Seventh increment: locale chunk source-map composition (#46/#44)

- Fixed the production-map failure recorded above. Chunk message replacements,
  import/preload rewrites and added headers now track positions against the input
  chunk, then compose those positions through its Vite source map.
- Each locale output emits/selects its own map. External sourceMappingURL names
  point to the locale file, inline maps remain inline, and hidden maps remain
  unlinked. Original localized-away maps are removed. sourceRoot and embedded
  source content survive composition.
- Production probes pass for virtual + both inline locales, unminified/minified,
  external/inline/hidden maps. Minified allocation tokens are checked at their
  actual upstream token position (Error after removal of new).
- Added pnpm test:maps and CI steps. Output hash version advanced to v3 and includes
  the Vite sourcemap mode because generated map comments affect JavaScript bytes.
- 167 unit tests pass; typecheck, lint (11 warnings, 0 errors) and build pass.
  Hash fixture still verifies deterministic output, 10 new JS URLs, 4 SRI values,
  old-asset coexistence and lazy CSS. Relative ICU mixed hydration passes again.
- This completes the reproduced top-level production stack-position defect, not
  all #46 acceptance. Still audit source positions inside expanded localizer/key
  expressions, regex literals/comments in call arguments, nested rewrites and
  unsupported expressions before closing #46. Remaining roadmap issues and remote
  validation are unchanged; no issue closures or push have been performed.

## Eighth increment: balanced expression parsing (#46)

- Replaced the character-based parenthesis/bracket scanner with TypeScript AST
  token boundaries. A regex character class or comment containing ] previously
  truncated a dynamic lookup key and produced invalid JavaScript. Both failures
  were reproduced before the fix (/tmp/vvi-expression-baseline.log).
- Six cases cover regex/comments/template literals in call arguments and computed
  keys. Transformed computed-key output also passes the real Vue template compiler.
- Production SSR fixture includes a comment containing ] inside a computed lookup.
  Both virtual and mixed inline browser hydration render the expected value.
- 173 tests, typecheck and build pass; targeted lint was run. Broader #46 audits
  (nested expression provenance/composition and unsupported syntax handling) remain
  recorded above. No roadmap issue is declared complete solely from these cases.

## Ninth increment: bounded Volar cache and parse reuse (#49)

- File dictionary and diagnostic entries now replace their previous revision.
  Generated types use a 256-entry LRU, file caches are capped at 256 files, and
  inline global dictionaries at 32 entries. Cache hits precede script parsing.
- Diagnostic identity includes the current module dictionary so script-defined
  message edits cannot reuse stale linked-message diagnostics from equal blocks.
- Added internal benchmark access and scripts/benchmark-volar-cache.mjs. Run
  `pnpm build && node --expose-gc scripts/benchmark-volar-cache.mjs 1000`.
- Instrumented baseline (404beff plus counters) for 1000 revisions / two dictionary
  reads each: script parses 2000; dictionary/diagnostic/type entries 1000/1000/1000.
  Updated: parses 1000, entries 1/1/256. Tests assert retention, reuse, latest
  dictionary values, type regeneration after eviction and LRU/delete/clear behavior.
- Exploratory no-GC heap deltas were 18,140,128 bytes before and 24,009,864 after;
  they do not prove reduced memory. Updated forced-GC run on Node v24.18.0:
  313.92ms, retained heap delta 4,747,040 bytes. A matched forced-GC baseline is
  still needed before making a memory or timing improvement claim.
- 12 existing Volar tests and 2 cache tests pass; typecheck/targeted lint/build and
  real vue-tsc documented/compact ICU acceptance pass. #49 remains open for actual
  file-deletion/config/project lifecycle verification and matched measurements.
  This cache change does not resolve the unconfirmed original #39 symptom.

## Tenth increment: Volar ownership, lifecycle and matched measurement (#49)

- Real plugin file caches now belong to Vue IR through a WeakMap. Shared type and
  global caches retain their bounds; disposed file content has no strong index in
  the live project. This uses the actual IR lifetime because VueLanguagePluginReturn
  has no dispose hook; no watcher or per-keystroke filesystem sweep was added.
- The new standalone lifecycle test drives real createVueLanguagePlugin,
  disposeVirtualCode and recreation, checks the selected locale after project
  reload, then verifies that disposed IR and released file-cache owners collect
  while project objects remain alive. It is wired to CI with --expose-gc.
- Unit checks also cover changed primary locale, updated linked targets clearing
  diagnostics, separate project caches and shared bounded type tables.
- Lifecycle testing exposed another confirmed Volar defect: language-core supplies
  lang=txt for custom blocks lacking a lang attribute. VVI now uses YAML in that
  implicit case, while explicit lang=txt still reports an unsupported language.
  This is independent of the still-unconfirmed symptom in #39's screenshot.
- Added scripts/compare-volar-cache.mjs, which instruments baseline 404beff only
  with counters, then runs baseline/current alternately in fresh --expose-gc
  processes. Raw results are notes/benchmarks/volar-cache-comparison.json.
  Three-sample medians for this 1000-edit internal workload: retained heap
  6,888,032 -> 4,747,416 bytes; elapsed 320.06 -> 287.78ms. These are fixture
  measurements, not general editor speed or memory guarantees. Retained entries
  and parse counts remain the deterministic regression criteria.
- Volar's 12 existing tests, 5 cache tests, typecheck, targeted lint, build,
  real vue-tsc and the lifecycle subprocess pass. Cache lifecycle/measurement
  evidence is now available; original #39 diagnosis and external diagnostics #13
  still require separate work. No issue closure/push has occurred.

## Eleventh increment: observable Volar adapter failures (#39)

- Moved generated-only insertion/replacement into src/volarAdapter.ts. Operations
  return whether an insertion point matched, preserve mapped user-code segments,
  and handle generated text split across multiple segments.
- The plugin detects missing context/setup or export insertion and emits a bounded,
  once-per-file language-server warning identifying the incomplete shape. It does
  not throw from resolveEmbeddedCode. JP/EN configuration docs describe this
  handling and the actually tested Language Tools/vue-tsc 3.3.1 combination.
- Four tests cover matching, nonmatching, mapped-user-code exclusion and a live
  plugin callback reporting unsupported generated code without throwing/repeating.
  Existing 12 Volar tests, typecheck, targeted lint, build, real vue-tsc and the
  cache lifecycle subprocess pass. No unsupported-shape warnings appeared in the
  real supported fixtures.
- Original screenshot symptom/version information remains unknown; logging an
  adapter failure is not an editor diagnostic or proof that the original report
  is fixed. #39 still needs that evidence, plus the wider acceptance audit.

## Twelfth increment: external diagnostic provenance (#13)

- External dictionary diagnostics now carry the originating fileName instead of
  losing that association when multiple files/globs are merged. A readText hook
  lets the editor validate its unsaved document buffer through the same parser.
- Two tests verify malformed -> corrected unsaved content, per-file JSON/YAML
  error association, glob refresh after deletion and clearing corrected errors.
  Targeted tests, typecheck and lint pass.
- This is the shared computation layer only, not completed editor diagnostics.
  Next is a separate VS Code DiagnosticCollection integration and real extension
  host tests for external-only edits, add/unlink/config changes and recovery.
  Do not reintroduce global YAML as virtual Vue files or duplicate errors in SFCs.
- Official VS Code programmatic-language-features documentation confirms the
  separate DiagnosticCollection update path. Local code CLI reports 1.137.0;
  DISPLAY=:0 and Xorg are present for extension-host validation. No extension has
  been installed into the user's profile or published.

## External editor diagnostics (#13), VS Code integration

- Added a separate VS Code extension under `extensions/vscode`. It owns one
  DiagnosticCollection and reuses the build dictionary validator; external YAML
  and JSON are never registered as Vue IR or injected into unrelated SFCs.
- TypeScript reads JSONC/extends with a read-only host. Configured plugin modules
  are inspected as data, never required/executed. Paths use the consuming config
  directory, matching Volar. Diagnostics retain the originating file; JSON syntax
  errors now also use parser offsets where available.
- Open document buffers, filesystem create/change/delete events, glob roots
  outside the workspace, config dependencies and workspace changes recalculate
  diagnostics. Generation checks discard stale asynchronous results; config
  removal replaces the collection and disposes unused watchers. Unexpected
  refresh errors go to a dedicated output channel.
- First actual extension-host run on VS Code 1.95.3 passed: malformed global YAML
  -> unsaved correction -> no error, external writes, glob add/delete and removing
  global config. No SFC edits or language-server restart were used. An expanded
  host fixture adds JSON ranges, second-project isolation and inherited config
  changes. Unit config tests cover JSONC inheritance, unsaved config changes,
  unsupported sources and avoiding diagnostics on unrelated TS projects.
- Root suite passes 188 tests in 15 files; root typecheck and lint pass (11 existing
  warnings, no errors). VSIX packaging and expanded host acceptance are still
  being checked below. This is not a claim that all roadmap issues are complete.

Follow-up verification: expanded VS Code host fixture also passes for JSON error
line, a second project and edits to an outside-workspace inherited config. VSIX
packaging succeeds (6 files, about 1.86 MB compressed), with no user-profile
installation or Marketplace publication. CI now builds/tests/packages the addon
and uploads its VSIX. Japanese/English getting-started docs explain installation.

The installed pnpm store had tslib marked skipped from an earlier optional
platform subtree, although vsce now requires it through Azure SDK. A forced
install with optimistic-repeat-install disabled repaired the missing links;
no runtime dependency override was added. vsce's credential/signing native
builds are explicitly disabled because this workflow only packages local VSIX.

Additional #13/Volar fix: use the Language Tools compilerOptions.configFilePath
for global path resolution when available; nearest tsconfig remains the fallback
for older/unconfigured hosts. A real language-core fixture uses tsconfig.app.json
with a nested, unrelated tsconfig and malformed -> valid dictionaries, asserting
SFC types survive and the correct external root is selected.

## Locale-only editor highlighting (#14)

- The separate VS Code extension now decorates named/list/literal/plural/linked
  Vue message syntax in scalar values inside locale custom blocks. SFC parsing
  restricts the feature to locale; YAML syntax trees exclude keys/comments and
  other custom blocks. JSON/YAML escapes retain original UTF-16 source positions.
- Runtime message lexing exposes syntax ranges; plural separator discovery is
  shared with compilation, so literal pipes are not incorrectly colored as
  separators. No replacement semantic-token provider competes with Vue tooling.
- Theme colors and an enable setting are contributed. ICU-configured project
  roots disable Vue decorations; conflicting same-root configs conservatively
  disable highlighting. Edits, removal, visible-editor and config changes refresh
  the decoration ranges.
- Five focused source-span tests cover all requested tokens, quoted/plain/block
  values, non-locale exclusions, JSON escapes, doubled YAML quotes, Unicode escape
  offsets, astral text and incomplete edits. The first four plus the full root
  suite passed together (193 tests); the added Unicode case is checked separately.
- Actual VS Code host verifies displayed source ranges, removing/re-adding a locale
  block and switching to ICU. Setting toggle coverage and final VSIX rebuild are
  being verified. Japanese/English message syntax docs and addon README describe
  installation, opt-out and ICU behavior.

Remaining roadmap acceptance is still open, especially #50 comparative delivery
benchmark/prototype/decision, the original #39 symptom, remaining #46 expression
provenance, full SSR framework/assets edge cases and final remote CI/review.
No Issues have been closed and no changes pushed or published.

Final #14 checks: all five span tests pass; extension typecheck/build and packaging
pass (VSIX about 1.89 MB). The expanded actual host test also passes setting
on/off, block removal/re-addition and ICU disabling. Targeted lint is clean.
