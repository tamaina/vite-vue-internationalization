# Asset preload and SFC subrequest patch

This patch is based on stable 1.1.3 (`c79a272`), without the unrelated features on `develop`. It leaves the public APIs, SSR behavior, message payloads, and runtime locale loading unchanged.

Vite's async preload helper interprets non-CSS dependencies as JavaScript. VVI was adding `viteMetadata.importedAssets` (images and fonts) to that list. The fix excludes those assets while retaining localized JavaScript, recursive static imports, and `importedCss`. Media still loads from its normal image/font/CSS consumer. The CSS-only proxy regression now checks that CSS is retained and font script preload is absent.

The second fix backports the existing `develop` request-boundary guard. Vue block subrequests and raw/URL representations are not complete SFCs and must not replace the source dictionary. Cache-busting SFC requests and actual removal of locale blocks continue to work. Both defects fail the new regressions before the production changes; the recorded pre-fix run has three failed tests.

Validation commands:

```sh
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm lint
pnpm build
pnpm exec eslint --quiet src/inline.ts src/plugin.ts test/plugin.test.ts test/inline-preloads.test.ts test/subrequests.test.ts scripts/test-asset-preloads.mjs
node scripts/test-asset-preloads.mjs
pnpm pack --out /tmp/vvi-patch.tgz
# Unpack into an independent consumer with matching dependencies:
VVI_PACKAGE_ROOT=/path/to/unpacked/package node scripts/test-asset-preloads.mjs
```

The package tests pass (101 tests), typecheck and build pass, and lint reports only two existing warnings in `test/volar.test.ts`. The browser regression checks both modes and both locales against the real emitted Vite loader, dynamic CSS/JS, image decode, and a TS-script SFC. It installs no host guard and filters no preloads. Public package and runtime declarations also compile from the unpacked tarball in a separate TypeScript consumer.

[The original Misskey benchmark](https://github.com/tamaina/misskey-a/blob/e5c48b8a/docs/architecture/vvi-strategy-benchmark.md) remains an unmodified VVI 1.1.3 baseline. Post-fix checks use a separate owned workspace reconstructed from its published prototype and tools, with the unpacked package selected explicitly and Misskey's subrequest guard removed. Matching dependencies are linked read-only; no installed production library is patched.

Post-fix measurements are recorded separately in [asset-preloads.json](asset-preloads.json). There is only one validation build per app/mode, not another timing experiment or warm-cache study. HTML service/templates and bootloader are real; API/SSR content is synthetic, and SW/streaming are not served. Authentication, SPA navigation, other browsers, in-place switching, and production CSP/SRI are outside this fixture coverage. The saved-language check uses full document reload.

Release through `Release Manager [Dispatch]` on the dedicated patch branch, with `version_increment_type=patch`, `merge=false`, and `start-rc=false`. Its prerelease triggers the existing `Stage package on npm` workflow. Keep the release PR draft and the staged package unapproved; do not merge/final-publish it. No Misskey production mode change is included.
