# T00 harness: real-engine, codec and application measurement

Baseline revision: `2b7d797a7d0abf0e11ca329b55f63e6a50700b15` (v0.17.0).
This documents the parameter contract implemented by `scripts/performance/run.mjs`.
The legacy corpus, its fields and default behavior are preserved; the harness
validates results against the selected case and fails the process on any gap.

## Layers

| `PICFORGE_BENCH_LAYER` | Entry             | What it measures                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy` (default)     | `run.mjs`         | Historical `decodeImage → resizeImage → WorkerPool` microbenchmark. It calls the shared decode/resize/codec functions, so it is a harness-shaped legacy path, not a frozen copy of the old implementation. Stage attribution only.                                                                       |
| `engine`               | `run.mjs`         | The real `createImageProcessor(createCompatImageEngine, vipsImageEngine, animationEngine)` path with the application's source preflight. Records requested/actual engine, per-request attempts, phase marks and long-task attribution.                                                                   |
| `codec`                | `run.mjs`         | Real-WASM regression through the exported shared `encodeImage`: full, nonzero-offset, offset-zero-short full SharedArrayBuffer and resizable ArrayBuffer views, each compared with an explicit copy of the same visible bytes for JPEG/WebP/AVIF/OxiPNG. Catches the AVIF backing-buffer subview defect. |
| `application`          | `application.mjs` | The built app: Landing → try sample → compressor, plus a real 48 MP import → cancel → retry smoke and simultaneous two-file import/download verification. Kept deliberately separate; never mixed with engine numbers.                                                                                   |

## Engine parameters

| Variable                         | Values                      | Default    | Notes                                                                                                                                        |
| -------------------------------- | --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PICFORGE_BENCH_LAYER`           | `legacy\|engine\|codec`     | `legacy`   | `application` is rejected here; use `application.mjs`.                                                                                       |
| `PICFORGE_BENCH_CASES`           | comma list of case ids      | all        | Unknown ids fail. A requested id that belongs only to another layer is reported in `skipped`. Zero selected cases in the chosen layer fails. |
| `PICFORGE_BENCH_ENGINE`          | `auto\|compat\|vips`        | `compat`   | Execution policy. `animation` is not a policy: A01 routes to the animation engine naturally.                                                 |
| `PICFORGE_BENCH_REPEATS`         | 1–20                        | 3          | Warm iterations on the same pool; iteration 0 is the first-use sample. No P95/P99 is computed.                                               |
| `PICFORGE_BROWSER`               | `chromium\|firefox\|webkit` | `chromium` |                                                                                                                                              |
| `PICFORGE_BROWSER_EXECUTABLE`    | path                        | —          | Engine/codec runner only; permits a temporary platform launcher.                                                                             |
| `PICFORGE_BENCH_OUTPUT`          | directory                   | `mkdtemp`  | Raw `results.json`, `engine-results.json`, `codec-view-results.json`, `application-results.json`.                                            |
| `PICFORGE_BENCH_VIPS_PROBE`      | `1`                         | unset      | Opt-in Vips availability probe. It never expands a normal selection.                                                                         |
| `PICFORGE_BENCH_FORCE_VIPS_FAIL` | `1`                         | unset      | Harness self-test: injects one explicit Vips runtime fault to exercise requested/actual/fallback recording. Never labels a fallback as Vips. |

`PICFORGE_SRGB_PROFILE` and `PICFORGE_P3_PROFILE` select external ICC files.
The runner uses the installed sRGB fallback paths when the former is unset. Requested
color cases with missing profiles are BLOCKED and cannot yield an overall PASS.
ImageMagick is required only when generating selected color fixtures. Profiles,
synthetic PNGs and raw reference pixels stay outside the repository.

The shared Vips qualification session is disposed in the runner `finally`.

## Engine case ids

`S01`–`S05` (12/24/48 MP and alpha), `S06` (`engine batch` of S01–S05 at the real
`getMainPipelineConcurrency()`) · `A01` (animated GIF → WebP, must route to the
animation engine) · `S08-corrupt`, `S08-cancel`, `S08-target` (invalid input,
real image-load cancellation/cleanup/retry, unsafe target) · `C01-o1/o3/o6/o8` (EXIF) · `C02-{contain,cover,
stretch,percentage}` · `C03-{avif,oxipng}` · `C04-{svg,bmp,gif-static,avif-input}`
· `C05-{srgb,p3}-icc` (tagged PNG patches, 128×96 → 64×48); `codec-view`.

Color references use ImageMagick/LittleCMS to convert the actual tagged source to
sRGB and resize it independently of browser Canvas. Embedded ICC bytes must match
the supplied profile SHA-256; the input and reference hashes/tool version are saved.
Both overall RGB/composited MAE <12 and alpha MAE <3 are required. Known flat swatch
centers additionally require per-channel error <12 so a small region cannot be
hidden by the global mean. The official Display P3 profile is available from the
[ICC registry](https://registry.color.org/rgb-registry/displayp3); it is not vendored.

Playwright 1.58.2 [disables Firefox ICC correction by default](https://github.com/microsoft/playwright/blob/v1.58.2/browser_patches/firefox/preferences/playwright.cfg).
The runner explicitly restores tagged-media color management (mode 2), sets
relative-colorimetric intent (1), and uses the supplied sRGB display profile.
These **test-only** preferences are recorded in `firefoxUserPrefs`; they do not
change the application or a user's browser settings. The disabled-CMS configuration
was observed to fail the P3 swatch gate, demonstrating that the gate detects it.

## Result validation

`validate.mjs` is a pure validator used by the runner and covered by
`validate.test.mjs` (`node --test scripts/performance/validate.test.mjs`). It
requires the exact sample count and iteration identity, verifies dimensions and
orientation at the real sample fields, requires every batch task exactly once per
iteration with valid output dimensions/engine, and requires all requested parity/color records and finite metrics. It requires the specific negative outcome: `cancelled`/`AbortError`
plus proof of image-load startup, cleanup and successful retry for cancel, an empty-attempt `target: pixel limit` rejection for the oversized target, and an
`Error` with the exact `Failed to read image dimensions` preflight reason, empty attempts, no actual engine and no fallback for corrupt data. The runner collects failures for every
selected case, writes the raw JSON, and then exits non-zero before printing
`PASS`. A child-process test proves the throw propagates to a non-zero exit with
no `PASS` output.

## Same-host baseline procedure

```bash
git worktree add --detach /tmp/picforge-base 2b7d797a7d0abf0e11ca329b55f63e6a50700b15
cp scripts/performance/{browser.ts,run.mjs,validate.mjs,application.mjs,tsconfig.json} \
  /tmp/picforge-base/scripts/performance/
(cd /tmp/picforge-base && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile)
```

No `git reset`/`git clean` is used and the current worktree is never replaced.

## Application timing and cancel/retry

Every application iteration uses a fresh context/page and is labelled
`fresh-context`; no warm median is computed. Timing and Long Tasks use
page-realm `performance.now()` marks (`pf-start`, `pf-first`, `pf-end`); the completion mark is frozen **before** observer drain. The observer is
drained with `takeRecords()` before `disconnect()`; a long task is counted when
its interval overlaps the declared window. Node wall-clock values
(`nodeFirstResultMs`, `nodeCompletionMs`) are separate fields. When Long Tasks are
unsupported the metrics are `null` and the capability flag is recorded. Page
errors, stale cancellation output, incomplete batch downloads or blocked required
coverage all fail the final application gate. Both downloaded and reported expected dimensions must match the fixed named 1600×1200 and 800×600 batch cases. The cancel/retry smoke imports a temporary generated 48 MP
JPEG, waits for a processing state, records action-to-visible-cancellation
latency, asserts no late stale publication and retries from the original source.

## Verification commands

```bash
node --test scripts/performance/validate.test.mjs
PICFORGE_BENCH_LAYER=codec pnpm benchmark
# Set PICFORGE_P3_PROFILE to an external Display P3 ICC file before color QA.
PICFORGE_BENCH_LAYER=engine PICFORGE_BENCH_CASES=C05-srgb-icc,C05-p3-icc,S08-cancel pnpm benchmark
# Reuse a current application build:
node scripts/performance/application.mjs
```

`pnpm benchmark` still performs its own isolated harness build. The application
probe reuses `packages/app/dist`; source changes require an application rebuild.
For baseline comparisons, copy harness changes only, use identical browser color
preferences, and do not mix data collected with different measurement boundaries.

## Remaining qualification boundaries

- Real Safari remains distinct from Playwright WebKit qualification.
- A host missing WebKit libraries must use an available compatible environment;
  the runner does not install or patch system/browser libraries.
- No process RSS/PSS sampling or isolated T03 end-to-end benefit is implied by these
  correctness checks. Fresh-context application observations are not warm samples.
