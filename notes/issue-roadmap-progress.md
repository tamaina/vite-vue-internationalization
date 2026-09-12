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
