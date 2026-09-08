# Phase 3 — image engine contract and compatibility policy

Validated locally on 2026-09-08 on `codex/wasm-vips-refactor`. No push, release or
production deployment. The production `auto` policy currently has only the
compatibility engine; full Vips image processing is Phase 4.

## Boundaries

`autoCompressController` owns scheduling, dimension preflight, settings snapshots,
task epochs, cancellation and store write-back. It passes a Blob and settings to
`ImageEngine.process`; it no longer reads full source buffers, decodes/resizes
pixels or submits codec-specific worker tasks.

The compatibility adapter in `packages/worker/src/compatImageEngine.ts` preserves
Canvas decode/resize and WorkerPool/jSquash encoding, including existing resize
geometry, advanced settings and progress stages. Result metadata includes both
original and output dimensions, original/output byte counts and the engine kind.
The source Blob stays reusable; each engine reads its own ArrayBuffer. The existing
pixel copy and main-thread Canvas work are deliberately retained in this phase.

The controller translates invalidated epochs, cancellation, removal and settings
changes into an AbortSignal. It checks freshness before creating a result URL, so
late results no longer allocate a temporary URL. Existing per-image snapshots,
restored matching results, cancel/retry behavior and dimension guards remain.

## Policy and session failures

`createImageProcessor` defaults to `auto`, with internal `vips` and `compat`
preferences. There is no new ordinary-user setting. A `vips` preference does not
bypass capability checks, unsupported formats or the circuit breaker.

- Missing preferred engine, failed platform capability, known failed initialization,
  unsupported format or open breaker → compatibility.
- Preferred processing failure → exactly one compatibility attempt using the
  original Blob. Compatibility success is a successful task; compatibility errors
  propagate to the existing bounded scheduler retry policy.
- AbortSignal cancellation or AbortError → no fallback, no breaker increment.
- Two explicitly classified `ImageEngineError(..., 'runtime')` failures disable
  preferred processing for that processor's lifetime. The app processor is a
  module-level singleton, so its state survives batches until page/session reload.
- Input-specific and unclassified errors fall back for the current request without
  opening the breaker. Preferred adapters must label infrastructure faults; the
  full Vips adapter will normalize its initialization/crash errors in Phase 4.

Capability checks use platform features and successful runtime initialization,
not browser names. `vipsInitializable` is unknown until initialization is attempted.
The Phase 2 raw probe remains isolated and is not itself registered as an engine.
No vips JS/WASM is included in the default app bundle.

## Isolation regression found and fixed

The expanded format test exposed a Phase 2 gap: cross-origin isolation makes
upstream jSquash automatically choose threaded AVIF and oxipng glue. PicForge
ships single-thread WASM only. AVIF then requested an absent `avif_enc_mt.wasm`
and received the SPA HTML fallback; parallel oxipng glue likewise does not match
the shipped binary. The earlier JPEG-only application smoke did not cover this.

Two exact-version pnpm patches remove automatic threaded initialization from
`@jsquash/avif@2.1.1` and `@jsquash/oxipng@2.3.0`. They preserve the public wrappers,
option normalization, licenses and existing binary bytes. No global capability
spoofing, additional threaded assets or extra nested thread pools are introduced.
Patches are recorded in `pnpm-workspace.yaml` and the lockfile, and are required
by frozen installation. Review them on codec upgrades; remove them only when an
upstream explicit single-thread option or a qualified resource plan replaces them.

## Verification

```sh
pnpm install --frozen-lockfile --prefer-offline
pnpm lint
pnpm typecheck
pnpm test
pnpm test:vips
PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser
# With pnpm dev running:
node scripts/ui-check.mjs
```

`pnpm test:vips` now also runs the actual compatibility adapter and policy against
the original pipeline. A synthetic alpha PNG covers all four output formats
(MozJPEG, WebP, AVIF, PNG) and five resize settings (disabled, contain, cover,
stretch, percentage): **20 combinations with exact encoded-byte and metadata
parity**, both with and without isolation headers, and after an injected vips
initialization failure. Chromium additionally runs the matrix after offline reload.
The original performance baseline files and measurements remain untouched.

Original Linux validation (reported by the handoff; its temporary artifacts were
not migrated to the Mac checkout):

- 139 tests in 17 files, including the existing 17 scheduler cancellation/settings
  race tests and new policy tests for transferred-buffer fallback, session failures,
  corrupt inputs, capabilities, overrides, single fallback and cancellation.
- Lint, all package typechecks and production build.
- Chromium 145.0.7632.6 and Firefox 151.0 probe/compatibility qualification.
- Existing synthetic static/Android/iOS acceptance: downloads, source reconstruction,
  pairing, cancel/retry, timestamps and ZIPs. Chromium offline reload/reconversion;
  Firefox retains its expected static video-preview fallback.
- UI: light/dark, five viewports, navigation queue retention, mobile preview.
- Frozen install with both patches; generated site validation; audit with no advisories.

Those artifacts were under `/tmp/picforge-phase3/` and `/tmp/picforge-ui-8dlV2y/`.
The original Firefox full-app acceptance preceded the final single-thread patches;
its four-format compatibility matrix followed those patches.

## Final review after checkout migration

On 2026-09-08, reviewed the original implementation plan in full and checked Blob
ownership, cancellation/epoch invalidation, fallback count, typed runtime failures,
and both exact-version patches. The handoff file was deleted without staging it.
No existing implementation or performance baseline was replaced.

Fresh frozen installation passed on macOS arm64. Lint, all typechecks, 139/139
tests, production build and site verification (54 files) passed. The first unit
run had 138 passes and one missing-`ffprobe` failure; installing native media test
tools and rerunning resolved it. Browser installation stalled under the machine's
Node 26.7.0; the existing Node 24.19.0 completed installation and subsequent tests.

Chromium 145.0.7632.6 and Firefox 146.0.1 both passed the probe/20-case compatibility
matrix and final-patch synthetic static/Android/iOS app acceptance on this checkout.
Chromium additionally passed offline reload/reconversion. Desktop/mobile app
screenshots were captured; mobile compression was visually inspected. The Browser
plugin skill is not available, so the existing Playwright scripts were used.

The first Chromium dev check was interrupted by Vite's initial dependency optimizer
reload; the stable-cache rerun passed. One Headless Shell run failed the probe's
solid-color tolerance assertion; a diagnostic including actual pixels was added,
and subsequent full Chrome and Headless Shell runs passed. The cause of that single
failure was not established; Phase 4 color qualification must not treat it as a
proven browser-specific color difference.

Current evidence: `/tmp/picforge-phase3-mac/` (`vips`, `vips-firefox`, `headless`,
`media`, `media-firefox`). These are local artifacts, not committed media fixtures.

No new performance result is claimed. Safari/WebKit, real camera qualification,
full Vips semantics, memory-aware scheduling and the preferred-engine benchmark
remain later phases. In particular, the Phase 2 vips pthread-pool limitation still
applies when designing Phase 4/5 concurrency.
