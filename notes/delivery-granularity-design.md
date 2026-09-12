# Delivery granularity investigation (#50)

Decision: do not adopt this prototype as a public API or change the default strategy.
The large-fixture transfer savings justify further design work, but the prototype
lacks the SSR/HMR and coordinated locale-switching behavior required for production.

## Reproduction and fixture

Run `pnpm benchmark:delivery`. The script builds each
strategy in a fresh Node process, serves gzip-compressed production assets, and
uses three fresh Chromium contexts with different dynamic keys for initial route, lazy route 1 and a return
to route 0. Raw request file lists, body bytes, browser readiness timings and
build resource usage are written to `notes/benchmarks/delivery-comparison.json`.
Each phase asserts the exact route-specific translation, global value and primary
fallback. Inputs are checked for identical dictionary hashes across strategies.
Assets are compressed once before serving; gzip CPU time is excluded from browser
timings. Body bytes exclude HTTP headers and TLS overhead. Resource Timing entries
are cumulative at each phase and retain request start times/durations.
This is a synthetic application comparison, not a production speed estimate.

Small: 3 route SFCs, 12 messages per route/language, 20 global messages/language.
Large: 40 route SFCs, 200 messages per route/language, 1000 global messages/language.
Both have Japanese primary and English target, a primary-only fallback message,
and shared global data. Every route renders the same dynamic dictionary access
using a URL-selected key, so all keys remain reachable in each strategy.
Generated text includes deterministic hashes and route markers to measure unused
route data actually present in initial response bodies. The high-entropy suffixes
limit compression; absolute byte counts depend on this corpus.

## Prototype boundary

The `route-prototype` is deliberately confined to this benchmark. It generates
one dictionary module per route/language plus one global module per language.
Navigation starts the component and dictionary imports together, then creates a
runtime instance with explicit loaders before displaying the component. Revisited
routes reuse the instance. The ES module cache shares global data and dictionaries;
per-route in-flight promises share concurrent preparation and clear on failure.
Primary fallback is premerged during fixture generation, as in the virtual payload.
No change to the library's public API or default build strategy is made.

This demonstrates deferred dictionary acquisition with current runtime helpers.
It is not a complete alternative compiler or production router integration.

## Measured results

Local run: 2026-09-12T12:50:14.732Z; Node v24.18.0, Chromium 148.0.7778.96, Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz, linux/x64.

Installed versions: vite 8.0.16, vue 3.5.34, @vue/compiler-sfc 3.5.34, @vitejs/plugin-vue 6.0.7, @playwright/test 1.60.0. Source hashes and base revision are in the raw JSON.

| Size / strategy | Initial gzip KiB / requests | Route 1 gzip KiB / requests | Initial route dictionaries | All output gzip MiB | Build ms | Process peak RSS MiB |
|---|---:|---:|---:|---:|---:|---:|
| small / virtual | 38.99 / 5 | 0.33 / 1 | 3 / 3 | 0.04 | 229 | 385.9 |
| small / inline-chunks | 39.00 / 5 | 2.43 / 1 | 1 / 3 | 0.07 | 472 | 454.3 |
| small / route-prototype | 37.88 / 6 | 0.99 / 2 | 1 / 3 | 0.04 | 157 | 370.2 |
| large / virtual | 412.02 / 5 | 0.33 / 1 | 40 / 40 | 0.79 | 1075 | 658.5 |
| large / inline-chunks | 198.94 / 5 | 161.73 / 1 | 1 / 40 | 12.70 | 5350 | 1125.6 |
| large / route-prototype | 95.72 / 6 | 10.29 / 2 | 1 / 40 | 0.93 | 393 | 542.3 |

The large virtual initial payload includes 39 unused route dictionaries (7800 ordinary message entries plus their fallback entries); the small fixture includes two unused route dictionaries. The gzip totals cannot be divided proportionally by route because compression shares patterns.

All cached returns transferred zero additional bytes with zero requests. Total output includes both languages and manifests; it is not the amount received by one visitor. Build time excludes fixture generation; peak RSS covers the entire fresh build process. Each build was measured once.

| Size / strategy | Median initial ready ms | Median route 1 ready ms |
|---|---:|---:|
| small / virtual | 46.5 | 3.8 |
| small / inline-chunks | 51.0 | 5.7 |
| small / route-prototype | 37.1 | 13.4 |
| large / virtual | 52.5 | 10.4 |
| large / inline-chunks | 52.0 | 21.9 |
| large / route-prototype | 48.2 | 8.2 |

Readiness includes Vue rendering and an animation frame; it is not a Core Web Vital. These three-run loopback samples are descriptive, not statistically established speed rankings. The complete file lists, timings, input hashes and outputs are in [the raw comparison](./benchmarks/delivery-comparison.json).

## Integration consequences

- Locale switching would require coordinated preparation across active route
  instances, then an atomic visible update. A single app instance with explicit
  registration might be a more ergonomic future API, but must retain request
  isolation, shared concurrent loads, retry behavior and fallback semantics.
- Global dictionaries remain language-wide. They set a floor for initial payload;
  splitting route dictionaries does not remove this cost. Referenced shared/local
  linked messages must be included in dependency collection before production use.
- SSR must collect used route identifiers, await their dictionaries, serialize the
  selected locale, and choose matching client dictionary/preload assets. Client
  hydration must reuse exactly that state. This benchmark measures client loading;
  existing SSR fixtures prove current modes, not the prototype's SSR readiness.
- HMR needs an explicit dictionary dependency graph and cache invalidation for
  route/global edits, new glob matches and deletions. Prototype production imports
  do not implement that development protocol.
- Editor types should keep the existing global/SFC declarations independent from
  transport granularity. Generated route IDs must be stable and shared between
  runtime, SSR manifests and editor/compiler transforms.
- Extra dictionary requests and deferred discovery may introduce a waterfall.
  Starting route code and dictionary imports together is part of this prototype;
  a route boundary that discovers dictionaries inside the component would be a
  different, likely slower design and requires separate measurement.
- Navigating many routes accumulates dictionaries and instances. Module caching
  avoids repeated transfers but has a memory cost; eviction is not implemented.

## Decision

The prototype is **not adopted now**. Small applications do not show enough byte
savings to justify another dictionary request and the additional integration
surface. The large corpus proves that route boundaries can avoid initially
transferring unused routes, but loopback readiness timings do not establish a
production speed advantage. Network latency, bandwidth limits and real message
entropy can change the tradeoff substantially.

The current inline strategy is not uniformly smaller: dynamic global access keeps
global data reachable in each localized route chunk. In this corpus that raises
both per-transition transfer and total multi-language output. The prototype
shares global modules, so its benefit includes both route deferral and global
reuse; it must not be described as a pure comparison of one variable.

No public registration API, compiler transport change or migration is shipped by
this investigation. Existing users keep their current strategy. A future proposal
would need: request-scoped registration with deduplicated promises/retries; shared
global/linked dependency collection; route-aware SSR manifest and hydration state;
locale-switch coordination; HMR invalidation; and a migration adapter for existing
virtual loaders. Those are explicit prerequisites before any adoption decision,
not features implemented by this benchmark.

The benchmark and raw output are wired into CI as a correctness/reproducibility
check and downloadable artifact. Timing values are reported, never used as
hardware-dependent pass/fail thresholds. Local results do not claim remote CI
has already run.
