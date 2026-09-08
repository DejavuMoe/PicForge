# Phase 4 — bounded Vips image engine

Implemented against sections 14–20 of the original **PicForge wasm-vips refactor
plan v0.1**, following the Phase 3 commit `288b1bf`. Qualification on macOS arm64,
2026-09-08; Node 24.19.0 and pnpm 11.8.0. No push, release or deployment.

## Scope and activation gate

`VipsImageEngine` is an internal, independently testable engine. **Production
`processingPool.ts` still registers only Compat.** No Vips JS/WASM enters the
ordinary app build. The new `pnpm test:vips:engine` command builds the real engine
into a separate temporary application. This is semantic/lifecycle qualification,
not the Phase 6 performance gate or permission to select Vips by default.

The existing scheduler, device guards, per-image snapshots, task epochs and
Compatibility Engine are retained. No Motion Photo/Live Photo implementation,
FFmpeg arguments, HEIC decoder, baseline corpus or baseline result was replaced.
Root/app versions and the service-worker cache version remain 0.15.0.

## Pipeline and ownership

`VipsImageEngine.ts` serializes requests through one dedicated Worker. The module
exports `vipsImageEngine` for a shared application lane; constructor injection is
used by lifecycle tests. Do not instantiate it for each file or each Compat worker.
The existing Phase 2 probe is a separate diagnostic, not a second production lane.

The source Blob is structured-cloned to the Worker and read there. The caller
retains the immutable Blob. No full source ArrayBuffer is copied on the UI thread
for fallback, and no fallback uses a transferred buffer. Output bytes are copied
out of WASM memory before transfer. The existing Phase 3 policy does exactly one
Compat attempt after a preferred failure, and never falls back on cancellation.

The Worker runs:

1. Check compressed signature, size, bit depth and static-image scope.
2. Decode with sequential access; check dimensions before pixel evaluation.
3. Explicit `autorot`, with normalized dimensions returned as original metadata.
4. Convert embedded ICC to sRGB; normalize untagged RGB/grayscale to sRGB.
5. Compute crop and output dimensions with the existing `calculateResizeGeometry`.
6. Crop the exact integer source rectangle and resize with independent x/y scales.
7. Premultiply alpha for interpolation, unpremultiply and round before casting.
8. Encode JPEG/WebP with `keep: 'none'`; delete all image handles in `finally`.

Contain retains the no-upscale behavior. Cover preserves the centered crop and
rounding. Stretch and percentage retain the existing geometry. Lanczos3 is the
Vips resampling kernel; encoded bytes and resampling pixels are not claimed to be
identical to Canvas/jSquash. Source/output dimensions are capped at 16,384 per side
and 50 MP in the Worker, and compressed input at 50 MiB. The application scheduler
continues to impose its stricter device-dependent input limits.

JPEG matches the existing jSquash behavior of consuming straight RGB and dropping
alpha, rather than adding a new white or black matte to partially transparent
pixels. Fully transparent RGB is normalized. WebP retains alpha. A floating-point
round before the final uchar cast avoids a systematic one-level channel loss.
These are web derivatives, not metadata/HDR archives.

The embedded-profile conversion follows the [libvips ICC transform contract](https://www.libvips.org/API/current/method.Image.icc_transform.html).
Alpha resampling uses the explicit premultiply/unpremultiply path required by
[libvips resize](https://www.libvips.org/API/current/method.Image.resize.html).

## Format and option coverage

| Request | Qualification-engine behavior |
| --- | --- |
| Ordinary 8-bit JPEG/PNG/WebP → JPEG/WebP | Vips when settings are representable |
| EXIF 1/3/6/8, grayscale, embedded sRGB/Display P3, PNG alpha | Explicitly qualified |
| JPEG auto subsampling, quality 80–89 | Compat; original encoder selects 4:2:2 |
| AVIF output / OxiPNG optimization | Compat |
| HEIC, GIF, SVG, unknown MIME | Compat before Worker initialization |
| Animated PNG/WebP, high bit depth, CMYK, HDR gainmaps/multipage | Worker detects and returns an input-specific failure; policy falls back |
| Unmapped changed advanced settings | Compat rather than silently ignoring them |

`vipsOptions.ts` centralizes the mapping. JPEG supports quality, progressive,
optimized Huffman coding, quantization table and explicit 4:4:4/4:2:0 selection.
JPEG Q=0 maps to 1, matching MozJPEG's lower bound; WebP retains Q=0. JPEG
arithmetic/baseline overrides, separate chroma quality, trellis-option changes
and other unrepresented settings remain on Compat. Default snapshots are accepted;
unchanged backend-specific defaults do not needlessly exclude a request.

Automatic JPEG subsampling needed a real correction during qualification:
[MozJPEG `set_quality_ratings`](https://raw.githubusercontent.com/mozilla/mozjpeg/master/rdswitch.c)
selects 4:2:2 at Q=80–89, whereas the pinned
[libvips JPEG interface](https://raw.githubusercontent.com/libvips/libvips/v8.18.3/libvips/foreign/jpegsave.c)
only selects 4:4:4 or 4:2:0. A 999×3 fixture exposed a substantial color difference
at Q=85. The engine now declines that automatic-quality band. Real JPEG SOF
markers verify that its Compat fallback retains 4:2:2. Explicit 4:4:4/4:2:0 requests
continue to work, including in that quality band.

WebP maps quality, effort, lossless, exact transparent colors, alpha quality,
sharp YUV, target size, entropy passes and automatic deblocking. Changes to
near-lossless strength, filter/SNS parameters and other unavailable controls
remain on Compat. The underlying codec is still different, so quality/size and
throughput comparisons remain Phase 6 work.

## Internal threads and resource lifetime

The exact `wasm-vips@0.0.18` browser ES-module patch has three linked changes:

- Pre-create exactly **six** Emscripten pthread Workers.
- Set **`VIPS_MAX_THREADS=6`**, rather than scaling it with hardwareConcurrency.
- Return the existing EAGAIN code when the pool is empty, instead of creating more
  Workers dynamically.

`vips.concurrency(1)` is also retained. This is not equivalent to a single pthread:
one active Vips job has one dedicated host Worker and six internal pthread Workers.
Chromium CDP independently counted those seven Worker targets after processing.

Early bounded-pool experiments failed because only the Emscripten pool had been
limited while the separate `VIPS_MAX_THREADS` still followed CPU count. The paired
limits are essential. The final patch preserves the upstream minimum pool size;
the failed four-thread experiment is not evidence that four correctly configured
threads can never work. Do not change either limit alone or remove the patch
without repeating real runtime qualification.

Initialization is lazy and reused, with a tiny JPEG operation validating the
runtime. Optional HEIF/JXL/resvg modules are excluded. The operation cache is
disabled to avoid retaining per-input operations between jobs. Deleting images
returns allocations to the WASM heap; it does not imply the browser immediately
returns the high-water heap allocation to the OS.

The original `vips.wasm` is unchanged: **5,084,535 bytes**, SHA-256
`7ca144fb2db374b456059ca3891b762e19f713f6d230747a9f97953ebeb9bbfb`.
A fresh frozen installation into an empty temporary workspace applied the patch
and verified its three linked constraints and binary hash. The license notice
identifies the modification. Existing source/relinking distribution obligations
remain a release gate; no new legal conclusion or publication is implied.

## Cancellation and fault classification

Queued cancellation rejects immediately without disturbing the active Worker.
Active cancellation requests `Worker.terminate()`, rejects with AbortError and
starts queued work with a fresh runtime. Generation tokens reject stale messages;
the scheduler's existing epoch checks remain the final store-write guard. A real
start event keeps progress at zero until completion; no codec percentages are
fabricated. Internal phase diagnostics distinguish preparing/processing/idle.

Startup, message transport/deserialization, malformed terminal results, crash,
watchdog, WASM traps, native allocation failures and thread exhaustion are runtime
faults. The worker normalizes wasm-vips's native `WebAssembly.Exception.message`
array (`[C++ type, detail]`), instead of assuming every failure is a JS Error.
Corrupt/unsupported inputs and incompatible color/bit-depth cases do not poison
the runtime or increment the session breaker. Two explicit runtime failures still
disable Vips for that processor's lifetime through the Phase 3 policy.

Synchronous codec calls cannot reliably service a cancel message. Qualification
therefore exercises termination during actual 20 MP WebP work, queued recovery,
an injected Worker crash, two initialization failures, and a real two-second
watchdog. It verifies one terminal outcome and original-Blob fallback.

Chromium target-destruction notifications are asynchronous. The test waits for
old parent/pthread target IDs to disappear, and for zero Vips targets after the
watchdog; all did disappear within the five-second inspection bound. This is
resource-retirement evidence, not a measured immediate RSS/CPU drop. Peak memory,
transient restart overlap and calibrated timeouts remain Phase 5/6 requirements.
The engine's 90-second default is explicitly a qualification watchdog, not a
benchmark-derived production timeout.

## Verification and evidence

Browser plugin skill unavailable; existing Playwright tooling was used against
127.0.0.1 development/preview servers. No personal media was uploaded. All generated
images, outputs, screenshots and temporary builds are outside the repository.

| Browser | Transform cases | JPEG marker cases | Alpha lossless RGB / alpha MAE | Lifecycle |
| --- | ---: | ---: | ---: | --- |
| Chromium 145.0.7632.6 | 168 | 16 | 0.381 / 0 | Pass, including independent pthread count and offline Vips reload |
| Firefox 146.0.1 | 168 | 16 | 0 / 0 | Pass |
| Playwright WebKit 26.0 | 168 | 16 | 0 / 0 | Pass |

Each transform matrix covers JPEG/PNG/WebP inputs, alpha, EXIF 1/3/6/8, tiny/wide/tall,
grayscale and ICC fixtures, two outputs and six resize configurations. Dimensions
and source metadata must match Compat exactly. Color comparisons use average
absolute per-channel error (0–255); alpha output is compared composited on both
black and white. The gate is RGB MAE <12 and alpha MAE <3 against Compat; embedded
profile cases were substantially below that. Both paths are also compared with
the canonical Canvas source/resize pixels, and metrics are recorded. These are
functional visual checks, not photographic rate-distortion/SSIM benchmarks.

JPEG markers verify progressive/baseline output and 4:4:4/4:2:0 at qualities
0/75/95/100. Metadata stripping is checked in actual outputs. Native fixtures
exercise animated WebP and 16-bit PNG rejection; repeated corrupt input is followed
by successful runtime reuse. No-isolation and unmapped-option requests succeed
through Compat. Comparison screenshots were visually inspected for orientation,
alpha and color. WebKit can decode WebP but not generate Canvas WebP fixtures, so
the input WebP is generated natively for every browser.

Main checks: lint, all package typechecks, **174 tests / 20 files**, ordinary
production build, site-output verification, and a separate strict TypeScript
check of the browser qualification entry. The original `test:vips` probe/Compat
matrix also passes with the bounded browser glue. The ordinary app still has 54
site files and no Vips engine assets.

Both production and dev engine paths were exercised in all three browsers. A
WebKit-only dev failure exposed Vite 8's cached-transform 304 fast path omitting
the configured isolation headers. `vite.config.mjs` now applies the configured
COOP/COEP values before those short-circuit responses (also for preview), honoring
the no-isolation overrides. Conditional-request assertions require COOP/COEP on
304s; WebKit then imports its Worker dependency graph successfully. No isolation
requirement was weakened. The out-of-index qualification entry is also declared
to Vite's initial dependency scanner in a temporary fresh cache, avoiding optimizer
HMR reloads during assertions without adding an unconditional test retry.

Local evidence is under `/tmp/picforge-phase4/engine{,-firefox,-webkit}/`:
`semantics.json`, `encoder-options.json`, `lifecycle.json`, `comparison.png`,
runtime request lists, `dev.json`, and Chromium target-retirement records. Fresh installation
evidence is in the separate temporary `picforge-phase4-install-*` directory.
Mac system sRGB/Display P3 profiles were used only to generate temporary fixtures;
the profiles are not redistributed in the repository. On other platforms provide
`PICFORGE_SRGB_PROFILE` / `PICFORGE_P3_PROFILE`; absent profiles reduce coverage and
must not be reported as full ICC qualification.

### User-supplied Motion/Live Photo regression

The user's `sample/` directory is ignored and remains local. Its Android Motion
Photo reconstructs the source bytes from the extracted JPG/MP4. The new iOS input
has **75 main-track frames**, not the 49 in the old private sample. The acceptance
script previously hard-coded that count, duration and image dimensions. It now
derives them from the current source using native ffprobe (including Frame Cropping
and rotation) and native ImageMagick HEIC dimensions. The original exact sorted
per-frame PTS assertion is retained, along with main-track selection, crop/rotation,
H.264/AAC, ZIP, cancellation/retry and playback/fallback checks.

The supplied sample produces a 1308×1744 MP4 with all 75 source PTS retained, and
a 4284×5712 JPEG. Chromium and Firefox camera acceptance pass, including Chromium
offline reload/reconversion. The synthetic Chromium suite also passes after the
fixture-agnostic assertion changes. Private outputs stay under `/tmp/picforge-phase4/private-*`; no camera
images or identifying metadata are included in this document or commit.

Real Safari manual qualification is still outstanding. This phase does not supply
large-image/batch comparative benchmarks, actual peak RSS measurements, calibrated
production timeouts, memory-aware scheduling, UI rollout or release permission.
The original performance baseline files remain unchanged.
