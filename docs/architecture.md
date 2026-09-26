# Architecture

PicForge processes files locally in the browser. React 19/Vite 8 provide the UI;
Zustand owns compression state, and i18next provides five locales. There is no
media-processing server, account system or upload pipeline.

## Code map

| Location | Responsibility |
| --- | --- |
| `packages/app/src/App.tsx` | Tool navigation, shared shell, theme and update prompt |
| `packages/app/src/CompressionWorkspace.tsx` | Compression workspace and active-tool import |
| `packages/app/src/stores/` and `hooks/` | Settings/file state, scheduling, epochs and result publication |
| `packages/worker/src/` | Image-engine policy, Compat Worker pool, decode/resize and experimental Vips |
| `packages/codecs/src/` | Pinned jSquash encoders, settings and format contracts |
| `packages/app/src/animation/` | GIF/APNG to animated WebP with FFmpeg |
| `packages/app/src/motion/` | Android extraction, Apple pairing, HEIC and video conversion |
| `packages/app/src/utils/resourceBudget.ts` | Shared memory estimates and admission queue |
| `packages/app/src/utils/ffmpegLane.ts` | One serial FFmpeg lane shared by media tools |
| `packages/app/scripts/` and `public/sw.js` | Static codecs, build integrity, app shell and engine caches |
| `scripts/` | Reusable validation, benchmarks and publication |

Packages are ESM; workspace dependencies export TypeScript source. Root tooling
and TypeScript configuration are shared. Exact dependency versions belong to
package manifests and `pnpm-lock.yaml`.

## Compression and animation

`fileStore/settingsStore → useAutoCompress → autoCompressController → imageProcessor`

The controller owns settings snapshots, dimension checks, selected-file priority,
memory admission, cancellation and task epochs. It publishes results only while
the task remains current. Global edits do not overwrite per-image snapshots.
Advanced options are normalized to the active format; presets replace format,
quality and advanced options while keeping resize settings.

`hooks/processingPool.ts` registers Compat for static images and a separate animation
engine. Static output formats are JPEG, WebP, AVIF and PNG:

- Compat sends the original Blob to its encoding Worker. `workerDecode.ts` uses
  `createImageBitmap` and `OffscreenCanvas` to decode/resize before jSquash encoding.
- The main-thread Canvas path handles SVG and missing Worker capabilities or a file
  the Worker cannot decode. Cancellation, timeout, safety limits and settings or
  encoding failures do not trigger this decode fallback.
- Both Canvas paths share `calculateResizeGeometry` and `drawScaled`: low-quality
  exact halvings followed by a high-quality final draw of at most 2:1 downscale.
  `contain` never upscales, `cover` crops centrally and `stretch` uses exact dimensions.
- Eligible PNG-to-PNG requests without resizing strip ancillary chunks and send
  the original image data directly to OxiPNG. A non-cancellation/non-timeout encoder
  failure retries through the original Blob's Canvas path. Transparency and other
  unsupported PNG cases use normal decode/encode.
- GIF/APNG route to the animation engine before static-engine selection. They
  export animated WebP; unsupported settings return errors rather than a silent
  first-frame result. See [animation semantics and limits](animation-pipeline.md).

Original Blob/File objects remain available for retry. Transfer an RGBA buffer
directly only when its view owns the entire buffer; otherwise copy the visible
range. No retry reads a detached ArrayBuffer.

## Scheduling and lifetime

One page-wide resource budget covers static compression, animation and Live Photo
work. Estimates include source pixels, intermediate downscale canvases, target
pixels and engine working memory. They are admission heuristics, not measured RSS
or a hard process-memory ceiling; an oversized admitted task runs alone. Source
and pixel rejection limits remain separate.

Compression concurrency is bounded by its Worker pool. Workers are created on
demand, retired after large tasks and released when idle. WASM heaps cannot shrink
while a Worker remains alive; termination does not prove immediate OS memory or
CPU recovery. Acquire memory budget before entering the shared FFmpeg lane so a
lane holder never waits for budget.

Only runtime-class compression errors receive automatic retries. Settings/timeout
errors can requeue after settings change. Cancellation and stale epochs cannot
publish a result or count as infrastructure failures.

## Motion and Live Photos

Android extraction finds the embedded JPEG/MP4 boundaries and preserves original
bytes without re-encoding or loading Apple engines. The parser bounds container
scanning; supported layouts must satisfy its structural checks.

iOS pairs Apple content identifiers where both files supply them, with a basename
fallback that remains unverified. Jobs run serially; within a job, still and video
conversion run concurrently subject to the shared budget. A failure cancels the
other half and produces one terminal outcome.

- HEIC uses the pinned libheif/libde265 Worker, then a separate MozJPEG encoder.
  Matrix/TRC ICC and supported nclx descriptions convert to sRGB. LUT-only RGB ICC
  is embedded in the JPEG instead of claiming an unavailable conversion. JPEG
  input is retained. Exports are web derivatives, not HDR/metadata archives.
- `movDemux.ts`, `videoFrames.ts` and `mp4Mux.ts` implement the WebCodecs path:
  sample timing, crop/rotation in YUV, range handling and MP4 H.264/AAC output.
  Eligibility requires source timestamps, supported 8-bit SDR video, valid distinct
  nonnegative timestamps and supported codec configurations. Hardware acceleration
  is selected by the runtime; the requested preference is `no-preference`.
- AAC audio can be copied; other supported source audio uses a concurrent FFmpeg
  helper. Unsupported video/settings, including explicit 30 fps, or WebCodecs
  failure use FFmpeg from the original File via WORKERFS. The clean-aperture adapter
  remains required for the pinned FFmpeg core.
- WebCodecs uses one dedicated Worker per conversion. Two runtime failures disable
  it for the page session; unsupported input does not. Cancellation rejects without
  fallback. The video paths must preserve frame count, PTS, geometry and colour
  semantics; their encoded pixels and output sizes need not be identical.

The [validation guide](validation.md) describes camera, playback and real-device
checks. A successful conversion alone does not establish native preview support.

## Experimental Vips

`packages/worker/src/vips/` contains an internal engine and separate probe.
**The production processor does not register Vips**, and ordinary builds do not
ship its JS/WASM. Test harnesses build temporary entries explicitly.

The engine uses one shared serial Worker lane. Its exact wasm-vips patch fixes the
pthread pool and `VIPS_MAX_THREADS` at six with growth disabled; do not multiply
instances by the Compat pool size. Its 90-second watchdog is a qualification
timeout, not a measured production limit. It handles bounded 8-bit JPEG/PNG/WebP input,
orientation, ICC-to-sRGB, alpha-aware resize and JPEG/WebP output with metadata
stripped. Unsupported formats/options route to Compat. In particular, automatic
JPEG quality 80–89 needs Compat's 4:2:2 subsampling.

Preferred-engine policy checks capability, initialization, supported settings and
session failures. It makes at most one Compat fallback from the original Blob;
two explicitly classified runtime faults open the session breaker. Cancellation
never falls back or increments the breaker. Correct initialization and output do
not detect successful-but-slow processing: production selection requires
[equivalent same-host measurements](performance/README.md) and application validation.
Keep 60 MP as a safety-rejection case.

## Assets, offline behavior and deployment

Dev/build preparation verifies the [four versioned HEIC files](heif-build.md),
copies other pinned codecs and checks byte equality between codec packages and
static WASM. Vite maps upstream fallback URLs to same-origin `/wasm/`, including
Worker imports. Preserve the single-thread AVIF/OxiPNG patches and codec notices.

The service worker precaches the app shell and generated `precache.json` entries.
Heavy engines load lazily and work offline only after successful caching; each
engine version has its own cache. A new worker waits for the update prompt, and
one previous shell generation retains hashed modules for open tabs.

Dev/preview bind to loopback and set COOP/COEP on normal and revalidated responses.
Compat remains usable without isolation. Production HTTP headers belong to the
host configuration, which is outside this repository. Built HTML constrains
connections and resource destinations with CSP; `script-src` is deliberately
unrestricted for WASM compatibility, so this is not a universal egress guarantee.

[Woodpecker](../.woodpecker/test-then-publish.yml) tests/builds/verifies once on
`master` pushes, then publishes that exact `dist/`. Only publication mounts the
deployment directory. The publisher uses checksum verification, a lock, stale-run
rejection, an atomic switch and current/previous release retention. See
[validation](validation.md#ci-and-publication) for the gates.

Keep root/app versions and `CACHE_VERSION` aligned when shipping. Preserve all
third-party notices and required codec source/build materials; the app's MIT
license does not relicense FFmpeg, libheif or other bundled components.
