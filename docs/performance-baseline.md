# Image pipeline baseline — Phase 0

Measured on 2026-09-08 (Asia/Singapore), before any runtime or image-engine migration.
Product source is unchanged. This is a baseline with explicit coverage gaps, not a release qualification or evidence that wasm-vips is faster.

## Frozen state

- Branch: `codex/wasm-vips-refactor`.
- Product revision: `765fbb177e379489cbf015728ffa9b6c25f27d6a`; initial `git status --short` was empty.
- Root/app version: `0.15.0`.
- Actual runtime: Node `v24.20.0`, pnpm `11.8.0`. No environment or dependency upgrades in this phase.
- Intel Core Ultra 7 255H, 16 logical CPUs, approximately 30.8 GiB system RAM; browser reports `hardwareConcurrency=16`, `deviceMemory=8`.
- Performance browser: Playwright Chromium `145.0.7632.6`, Linux, headless, no CPU throttling, `crossOriginIsolated=false`.
- This is a working desktop with other applications running. Numbers are observations from one host, not hardware-independent budgets.

## Reproduce

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
pnpm benchmark
```

`pnpm benchmark` type-checks the harness, prepares the existing codec assets, builds a separate production-mode entry with the application's Vite configuration, and runs Playwright against a temporary preview server. It does not add a route, instrument product code, or modify the application's `dist/`. All generated build assets and raw runtime output go to temporary directories by default. Set `PICFORGE_BENCH_OUTPUT` to retain `results.json` at a chosen location, `PICFORGE_BENCH_REPEATS` for 1–20 warm repetitions (default 3), and `PICFORGE_BROWSER` / `PICFORGE_BROWSER_EXECUTABLE` for a different installed browser.

The corpus generator is in [browser.ts](../scripts/performance/browser.ts); orchestration is in [run.mjs](../scripts/performance/run.mjs). Fixtures are generated in memory from seeded pixels, without external images or new dependencies. SHA-256, dimensions, input byte counts, settings and all encoder defaults are retained in the [raw snapshot](performance-baseline-results.json). Canvas source encoding can differ across browsers/versions: compare fixture hashes before comparing runs. Synthetic gradients/noise are not substitutes for real photography or a color-quality corpus.

### Measurement boundaries

Each of the 22 cases gets a fresh normal-sized `WorkerPool`, one first-use sample and three warm samples. Only one job is submitted at a time. Three workers are allocated on this host, but only one encodes; these are single-image measurements, not batch throughput. “Cold-worker” means the first job on a fresh pool, created before the timed preflight. It includes lazy codec/WASM initialization; worker startup may overlap preflight and is not measured separately. It does **not** promise cold OS/HTTP caches or simulate a first site visit.

The harness calls the current `readImageDimensions → validateImageDimensions → Blob.arrayBuffer → decodeImage → resizeImage → RGBA copy → WorkerPool.enqueue` sequence. Fixture generation, hashing, output verification, UI rendering, store updates and the 300 ms auto-compress debounce are outside the timed window. No React scheduler is substituted into the measured worker path.

- `preflightMs`: image dimension loading and its possible native decode cost.
- `readMs`: rereading the compressed Blob.
- `decodeMs`: browser image loading, drawing to full-size Canvas and `getImageData`.
- `resizeMs`: current geometry and Canvas transform; essentially zero when disabled.
- `copyMs`: the same extra `pixelData.buffer.slice(0)` used by the controller before transfer.
- `encodeMs`: **worker round-trip**, including dispatch, codec initialization when cold, worker-side pixel copying and encoding. The existing worker has no internal timer, so this is not pure native codec time.
- `totalMs`: wall time from dimension preflight to encoded buffer receipt, excluding output validation.
- `longTaskMs` / `longTaskCount`: main-frame Long Tasks API observations within that window; `blockingMs = Σ max(0, duration − 50 ms)`. This is a main-thread responsiveness proxy, not all CPU time or Lighthouse TBT. Unsupported browsers report `null`.
- `rgbaWorkingSetLowerBoundBytes`: source RGBA plus target RGBA (4 bytes/pixel each), an analytical working-buffer floor; **not measured peak memory**. Canvas backing stores, duplicate worker buffers, native decoder/WASM heaps and garbage-collection timing are not counted. No unreliable browser heap number is presented as total memory.

The report keeps raw cold/warm samples. Tables below use the median of three warm samples per column; column medians need not sum to the median total.

## Current behavior and contracts

| Area | Baseline |
| --- | --- |
| Static input admission | JPEG, PNG, WebP, AVIF, GIF, BMP, SVG by MIME or extension (`fileUtils.isSupportedImage`). Actual decode depends on browser `Image` support; admission is not a guarantee of decoding. |
| Static output | MozJPEG, WebP, AVIF, OxiPNG, all through existing jSquash codecs. Default JPEG quality 75, resize off. |
| JPEG settings | Quality 0–100; progressive on; automatic subsampling enabled, `chroma_subsample=2`; UI offers 4:4:4/4:2:0 and trellis multipass. Defaults and advanced values merge in `buildEncoderOptions`. |
| WebP settings | Quality 75, method 4 (UI 0–6), lossy default, alpha compression 1 and alpha quality 100; UI exposes lossless/method/alpha compression. |
| AVIF settings | Quality 75, speed 6 (UI 0–10), subsample 1 (4:2:0), alpha quality −1; 4:4:4 is 3. Legacy subsample 0 is normalized to 3, not monochrome. |
| OxiPNG settings | Level 2, interlace false, optimizeAlpha false. UI exposes interlace; this is PNG optimization, not generic PNG encoding semantics. |
| Contain | Preserves ratio, uses `ceil` on the secondary dimension, independently caps dimensions at the source to avoid upscaling. 2400×1600 into 1920×1080 → 1620×1080. |
| Cover | Computes a rounded centered source crop, then exact requested dimensions; may upscale. Fixture → 1920×1080. |
| Stretch | Exact requested dimensions with independent axes; may upscale. Fixture → 1920×1080. |
| Percentage | Rounds source dimensions × percentage, then applies the selected geometry method. 50% fixture → 1200×800. |
| EXIF | Canvas/browser normalization observed for 1/3/6/8 with quadrant-color assertions and swapped-dimension checks. Generated JPEG output contains no Exif block. No original EXIF/GPS metadata is forwarded by the RGBA-only pipeline. |
| Transparency | WebP, AVIF and OxiPNG alpha ramps are asserted after output decode. JPEG cannot retain alpha; the first fully transparent pixel's encoded RGBA is recorded as `alphaProbe`. No explicit product-level matte color exists. |
| Animation | A literal two-frame GIF fixture decodes to one red first-frame pixel on this Chromium. Static encoders receive only one raster and do not preserve animation. Other animated containers are not individually qualified. |
| HEIC | Not admitted into static compression. Separate iOS workspace uses libheif in a worker, encodes a JPEG derivative and does not promise archival HDR/metadata preservation. |
| Motion Photo | Existing Android binary splitting, no re-encoding; parser/reconstruction unit checks pass. Original-device browser fixture absent this run. |
| Live Photo | Basename pairing; serial HEIC/FFmpeg work, clean-aperture adapter, rotation and source PTS preserved by existing code/tests. Original pair browser conversion absent this run. |
| Color | Native Canvas conversion followed by raw RGBA encode. sRGB synthetic colors checked; embedded ICC, Display P3, HDR and photographic SSIM remain unmeasured in Phase 0. |

### Scheduling, lifecycle and UX

The original controller validates dimensions before decoding, retains each source `File` in the store, and uses task epochs/settings hashes to suppress stale writes. Main processing concurrency is 1 when cores ≤4 or reported RAM ≤4 GiB, otherwise 2. The pool chooses 1 worker at ≤2 cores, 2 at ≤4 cores, otherwise up to 3. AVIF encoding is limited to 1; OxiPNG to at most 2; other formats to the pool size. Main-pipeline limits span each complete job, so the UI does not necessarily fill all worker slots.

Safety limits are 24 MP on low-resource hints, otherwise 50 MP, and 16,384 pixels per side. The 60 MP case generates an actual compressed source, runs dimension preflight, and is rejected before application RGBA decode/encode. It is not timed by bypassing the guard. Browsers may perform native work during dimension preflight itself.

Workers are created lazily when the processing pool is first requested and reused across jobs. Each worker lazily initializes codec instances with Promise locks. Active cancellation terminates/replaces the relevant worker; queued jobs are removed. `abortAll` rebuilds the pool, `destroy` terminates it. Main-thread decode/resize cannot be interrupted mid-call; epoch checks suppress their stale results afterward. Worker errors/timeouts terminate and recreate workers. Nonpermanent controller errors can retry twice.

Encoding timeouts are 45 s for JPEG/WebP, 60 s for OxiPNG and 120 s for AVIF, starting at worker dispatch; there is no whole-job deadline covering dimension loading or main-thread decode. iOS HEIC has a 120 s worker timeout; FFmpeg has a 240 s exec timeout inside a 300 s termination timer. Completion and cancellation terminate those media runtimes.

Progress is coarse staging (0/30/50/60/80/100), not continuous encoder progress. Decode, resize and pixel copies still block the main thread. Per-image settings remain complete snapshots; global edits do not replace custom settings. These behaviors are frozen for later migration comparisons.

### PWA and asset boundary

`prepare-codecs.mjs` copies self-hosted assets from installed packages. Static WASM assets under `/wasm/` are in the service-worker shell cache; production JS/CSS chunks are emitted into `precache.json`. Heavy HEIC/FFmpeg assets load lazily and are cached on first successful use. `CACHE_VERSION` remains `picforge-v0.15.0`. No deployment headers or engine-selection policy changed.

The production smoke now runs without private media: import generated PNG, encode/download JPEG, verify its dimensions, check mobile width, then (Chromium) reload offline and re-import/re-encode. Desktop 1440×1000 and mobile 390×844 screenshots were visually checked. This verifies static compression offline; it does not newly qualify HEIC/FFmpeg offline conversion.

## Checks and coverage gaps

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed, no warnings in this checkout. |
| `pnpm typecheck` | Passed for app, worker and codecs. |
| `pnpm test` | 16 test files / 128 checks passed. |
| `pnpm build` | Passed; generated assets remain untracked/ignored. |
| `pnpm test:browser` | Chromium static import/encoding/download/dimensions/mobile/offline checks passed. Original-media checks explicitly skipped because fixtures are absent. |
| Firefox static smoke | Passed using locally installed Firefox 151.0 via `PICFORGE_BROWSER_EXECUTABLE`; Playwright's default expected Firefox installation is absent. Offline behavior not asserted by this script for Firefox. |
| `pnpm benchmark` | 22 cases: 21 successful encodes, one expected 60 MP rejection; three warm repeats plus one first-use sample for each successful case. EXIF direction/dimensions/stripping, alpha, transfer detachment, output dimensions and GIF first-frame checks passed. |
| `pnpm outdated` / recursive snapshot | Completed with outdated entries (nonzero exit as expected); no updates applied. |
| `pnpm audit --json` | Completed, 22 advisory records: 1 critical, 17 high, 4 moderate. Recorded as baseline debt; not a clean audit. |

The checkout has no `sample/` directory and none of `PICFORGE_SAMPLE_ANDROID`, `PICFORGE_SAMPLE_IOS_HEIC`, `PICFORGE_SAMPLE_IOS_MOV` was provided. Do not treat the historical [sample report](SAMPLE_VALIDATION.md) as a fresh run. Supply the three original fixtures and rerun `pnpm test:browser` before calling the media regression gate complete. This phase neither deletes nor commits personal media.

Safari/physical iOS and Android devices, batch throughput, real peak memory, ICC/P3/HDR and photographic quality comparison remain open coverage. The synthetic baseline is suitable for same-environment regression comparisons, not for choosing the default Vips coverage by itself.

## Dependency inventory

Installed versions below come from the current lockfile/node_modules via recursive `pnpm outdated`, not the manifest's minimum ranges. In particular TypeScript is actually 5.9.3 and React is 18.3.1. Registry `latest` values are a dated snapshot, not an approved compatible upgrade set. Phase 1 must verify family compatibility and migration requirements before selecting versions.

| Package | Installed | Registry latest (2026-09-08) |
| --- | --- | --- |
| `@types/node` | 20.19.43 | 26.4.1 |
| `@types/react` | 18.3.31 | 19.2.18 |
| `@types/react-dom` | 18.3.7 | 19.2.7 |
| `@typescript-eslint/eslint-plugin` | 6.21.0 | 8.69.0 |
| `@typescript-eslint/parser` | 6.21.0 | 8.69.0 |
| `@vitejs/plugin-react` | 4.7.0 | 6.1.1 |
| `eslint` | 8.57.1 | 10.10.0 |
| `eslint-config-prettier` | 9.1.2 | 10.1.8 |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.1.1 |
| `i18next` | 26.3.1 | 26.4.2 |
| `libheif-js` | 1.19.8 | 1.23.2 |
| `playwright` | 1.58.2 | 1.63.0 |
| `prettier` | 3.8.4 | 3.9.6 |
| `react` | 18.3.1 | 19.2.8 |
| `react-dom` | 18.3.1 | 19.2.8 |
| `react-i18next` | 17.0.8 | 17.0.13 |
| `react-icons` | 5.6.0 | 5.7.0 |
| `typescript` | 5.9.3 | 7.0.2 |
| `vite` | 5.4.21 | 8.2.2 |
| `vitest` | 2.1.9 | 5.0.0 |
| `zustand` | 4.5.7 | 5.0.15 |

Audit advisory names, severities and source URLs are retained in the raw JSON. The critical item concerns the Vitest UI server; `pnpm test` here runs `vitest run`, not that server. Audit counts do not establish that 22 exploitable vulnerabilities are present in the shipped static application. They remain migration work, not silently suppressed findings. Existing jSquash and FFmpeg versions were not changed.

## Warm performance results

All times are milliseconds. Encode is the worker round-trip defined above. No resizing unless the case name says so.

| Case | Preflight | Decode | Resize | Copy | Encode | Total | Output bytes | Blocking |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jpeg-12mp | 5.2 | 91.9 | 0.0 | 14.9 | 680.1 | 793.7 | 575,061 | 51.0 |
| jpeg-24mp | 7.1 | 186.1 | 0.0 | 29.6 | 1387.2 | 1615.1 | 1,147,581 | 175.0 |
| jpeg-48mp | 11.6 | 372.3 | 0.0 | 57.5 | 2914.7 | 3361.6 | 2,291,641 | 393.0 |
| jpeg-60mp | rejected | — | — | — | — | — | — | — |
| png-photo | 8.4 | 72.0 | 0.0 | 4.9 | 203.6 | 293.5 | 171,402 | 34.0 |
| png-alpha-mozjpeg | 2.5 | 4.3 | 0.1 | 0.1 | 8.6 | 16.2 | 5,360 | 0.0 |
| png-alpha-webp | 2.0 | 3.2 | 0.0 | 0.1 | 13.4 | 19.1 | 5,884 | 0.0 |
| png-alpha-avif | 2.1 | 3.4 | 0.0 | 0.2 | 64.6 | 71.2 | 12,752 | 0.0 |
| png-alpha-oxipng | 2.1 | 3.4 | 0.0 | 0.1 | 67.5 | 72.9 | 126,393 | 0.0 |
| png-screenshot | 2.7 | 58.0 | 0.0 | 10.3 | 323.5 | 404.8 | 165,232 | 16.0 |
| webp-static | 3.0 | 61.5 | 0.0 | 4.9 | 260.1 | 329.7 | 203,254 | 13.0 |
| exif-1 | 1.7 | 2.1 | 0.0 | 0.1 | 5.6 | 9.9 | 1,257 | 0.0 |
| exif-3 | 2.4 | 2.4 | 0.0 | 0.1 | 5.5 | 11.0 | 1,266 | 0.0 |
| exif-6 | 2.6 | 2.1 | 0.0 | 0.0 | 5.7 | 11.2 | 1,340 | 0.0 |
| exif-8 | 1.6 | 1.8 | 0.0 | 0.1 | 4.5 | 8.2 | 1,345 | 0.0 |
| resize-contain | 3.0 | 30.8 | 30.9 | 2.6 | 89.3 | 157.4 | 63,433 | 11.0 |
| resize-cover | 3.1 | 31.0 | 27.2 | 3.0 | 111.9 | 178.6 | 79,273 | 9.0 |
| resize-stretch | 2.9 | 30.9 | 26.6 | 3.0 | 113.6 | 176.7 | 76,313 | 8.0 |
| resize-percentage | 2.8 | 31.6 | 23.7 | 1.5 | 50.8 | 111.0 | 32,877 | 4.0 |
| tiny | 1.8 | 1.6 | 0.0 | 0.0 | 1.5 | 5.0 | 335 | 0.0 |
| wide | 2.4 | 8.4 | 0.0 | 0.7 | 31.7 | 43.7 | 36,775 | 0.0 |
| tall | 2.2 | 8.6 | 0.0 | 0.9 | 43.0 | 54.5 | 37,926 | 0.0 |

The 48 MP RGBA source alone is 192 MB (decimal). The recorded two-buffer floor is 384 MB, before Canvas, codec and other duplicates. Main-thread blocking grows with image size even though encoding runs in a worker. Phase 1 should preserve these semantics; subsequent Vips experiments must compare equivalent output settings and quality, rather than treating a smaller/faster output as automatically equivalent.

For the fully transparent alpha fixture endpoint, warm JPEG decodes to [0, 0, 69, 255] (RGBA); this observed dark endpoint is not a promise of a uniform configurable matte.
