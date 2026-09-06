# PicForge

A local browser image toolbox. No uploads, accounts, telemetry, or remote processing.

| Tool | Input | Output |
| --- | --- | --- |
| Image compression | JPEG, PNG, WebP, AVIF and browser-decodable images | MozJPEG, WebP, PNG, AVIF, resize and comparison |
| Android Motion Photos | JPEG with appended MP4 | Original JPG + MP4, without re-encoding |
| iOS Live Photos | Unmodified HEIC + MOV originals | Matching JPG + H.264/AAC MP4 |

React, TypeScript and Vite power one shared shell. The existing Squoosh-derived `@jsquash/*` compression pipeline remains in place. MotionFlow's extraction design is integrated directly; there is no second Next.js application.

## Run

Use a current Node.js LTS and the pnpm version in `package.json`.

```sh
pnpm install
pnpm dev
# Production
pnpm build
pnpm preview
```

Build and dev commands copy pinned media engines into `public/wasm/`; generated engine files and build output are ignored. Deploy `packages/app/dist/` to a static HTTPS host. All runtime dependencies are served from that same host, including fonts and WASM. No CDN is needed. Single-thread FFmpeg does not require cross-origin isolation headers.

## Workflow

Choose image compression, Android Motion Photos, or iOS Live Photos in the top navigation. Tool queues stay available while switching. Image compression retains its global/per-image settings, slider comparison, pan/zoom and ZIP manifest.

For iOS, select matching photo/video originals together. Pairing uses case-insensitive directory + basename, not Apple content identifiers. Lone images and videos are supported; duplicate names are flagged. Select a preset, then start the batch. Cancel releases active workers; completed items remain downloadable and unfinished items can be retried. ZIP uses a separate numbered directory per item to prevent filename collisions.

Balanced video defaults: x264 CRF 23, veryfast, long edge at most 1920 without upscaling, yuv420p, optional AAC 96k, faststart. JPEG defaults to MozJPEG quality 85 at original resolution. Source frame timestamps are preserved by default; choosing 30 fps explicitly resamples. Apple clean-aperture cropping and rotation are applied before export. Quality and compact presets offer CRF 20 / 1920 and CRF 26 / 1280 respectively.

These are web derivatives, not recreated Apple Live Photos. HEIC metadata, HDR/gain maps, auxiliary images and original color-profile fidelity are not guaranteed. Android extraction preserves source bytes and its original video codec. When a browser cannot play the output codec, a static preview and explanatory message are shown while downloads remain available. Motion batches accept at most 100 files / 256 MB total; individual sources are limited to 100 MB and HEIC images to 50 MP. Large exports still require available browser memory.

Codec engines load only on first use. Offline conversion requires a previous successful engine load/cache. Keep originals elsewhere: queues are in memory and are cleared when the page closes.

## Checks

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
# Requires FFprobe and Playwright's Chromium browser:
pnpm exec playwright install chromium
pnpm test:browser
```

The browser check uses `sample/` without modifying it, exercises cancellation/retry, extraction, actual WASM conversion, source timestamps, downloads, mobile layout and offline conversion, and writes artifacts to a temporary directory. Use `PICFORGE_BROWSER=firefox` or `webkit` for another installed Playwright engine; `PICFORGE_BROWSER_EXECUTABLE` can select an existing executable. `PICFORGE_QA_OUTPUT` controls the artifact directory.

See [the agent guide](AGENTS.md) for current implementation and constraints, [sample validation](docs/SAMPLE_VALIDATION.md) for measured results, and [the QA checklist](docs/QA_CHECKLIST.md) for release checks.

## Licenses

Application code is MIT. FFmpeg's WASM core is GPL-2.0-or-later; libheif is LGPL. They are not covered by the app's MIT license. [Third-party notices](packages/app/public/licenses/NOTICE.txt) and license texts are included in the build. A public binary release must also provide the required corresponding-source distribution for those codecs; no release or deployment is performed by the local build.
