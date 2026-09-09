# PicForge

An open-source image toolbox that runs in your browser. Compress and resize images, extract Android Motion Photos, and convert iOS Live Photo originals into JPEG and MP4. Your files stay on your device.

[Open PicForge](https://picforge.de) · [简体中文](docs/readme/README.zh-CN.md) · [繁體中文](docs/readme/README.zh-TW.md) · [日本語](docs/readme/README.ja.md) · [한국어](docs/readme/README.ko.md)

## Pick a tool

| Tool | Input | Output |
| --- | --- | --- |
| Image compression | JPEG, PNG, WebP, AVIF and other supported browser images | JPEG, WebP, PNG or AVIF; optional batch resize |
| Android Motion Photos | Original JPG Motion Photos with appended video | Original JPG + MP4, without re-encoding |
| iOS Live Photos | HEIC/HEIF + MOV originals; individual photos or videos also work | JPEG + H.264 MP4, with optional audio |

No account, installation, upload or telemetry is required. The app loads its own static assets and processing engines; media processing happens in local browser memory.

## Use PicForge

1. Choose a tool on the home page. **Try sample** opens a generated, non-personal sample in the real compression tool.
2. Add files. Compression also accepts drag-and-drop and image paste. For Live Photos, import the matching photo and video together.
3. Adjust settings. Compression starts automatically; Motion/Live Photo tools have an explicit batch action.
4. Compare the original and result, inspect details with zoom, then download one file or all completed results. Multiple compression results and Motion/Live Photo batches include a ZIP manifest.

**Settings scope matters.** All images changes the shared settings. This image creates a complete independent snapshot. Global changes leave custom images alone; Use global explicitly reconnects an image to shared settings.

**Resize behaves predictably.** Fit within bounds preserves proportions and never enlarges the source. Center crop fills the requested dimensions from the center. Stretch uses exact dimensions. Percentage sizing is in Advanced settings. Number fields apply on Enter or when leaving the field; Escape cancels the draft. PNG is lossless and does not use the quality slider.

**Queues survive tool navigation.** Switch tools, return home or use browser Back/Forward without losing the current session's queues. Reloading or closing the page clears files and results, so download first. On mobile, select a file to open its preview; use Back to files to return. Settings follow the preview, with batch actions kept visible.

## What to expect

- Android extraction preserves the original bytes. Video preview depends on the embedded codec; a playback fallback does not prevent downloading the extracted file.
- iOS pairing uses filenames, not Apple asset identifiers. Duplicate names require attention. Outputs are web derivatives: HEIC metadata, HDR and auxiliary images are not preserved as an archive.
- Source timing is preserved by default for video, with an explicit 30 fps option. The pinned FFmpeg uses a clean-aperture adapter for crop and rotation.
- Engines use bounded workers and size/pixel guards. Very large files can be rejected to protect browser memory. Cancellation and retry keep the original source available.
- Offline use requires the app assets to be cached. Heavy conversion engines are available offline only after they have loaded and cached successfully. The first conversion may need a connection.
- Language follows the browser with English fallback. Explicit language and theme choices are stored locally when storage is available. English, Simplified Chinese, Traditional Chinese, Japanese and Korean share the same light/dark interface.

## Run locally

Requires Node.js **22.12.0 or newer** and pnpm **11.8.x**.

```sh
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. To build and preview:

```sh
pnpm build
pnpm preview
```

Dev/build prepare pinned, self-hosted codecs under `/wasm/`. The build generates `precache.json` for the service worker. No processing server or API key is needed.

## Development and checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

With the dev server running:

```sh
# Synthetic UI checks; no HEIC/MOV conversion
PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs

# Production compression and offline acceptance
pnpm test:browser
```

UI checks support `PICFORGE_UI_BROWSER=chromium|firefox|webkit`, `PICFORGE_UI_URL` and `PICFORGE_QA_OUTPUT`. Browser engines must be installed through Playwright. The media acceptance script requires native `ffprobe`; synthetic Motion/Live Photo conversion additionally requires `heif-enc` and `ffmpeg`. Private camera files are optional and must never be committed. See [QA checklist](docs/QA_CHECKLIST.md) for test selection.

The app uses React, Vite, Zustand and i18next; UI controls use native HTML and CSS. JSZip is loaded for archive export. `@jsquash/*` remains the production compression path. FFmpeg and libheif are loaded for the conversions that need them. Experimental wasm-vips is **not** selected in production.

| Location | Purpose |
| --- | --- |
| `packages/app/src/` | App shell, three workspaces, settings, previews and locale resources |
| `packages/codecs/` | Codec contracts, settings and engine policy |
| `packages/worker/` | Decode, resize, encode and worker lifecycle |
| `scripts/` | Asset preparation, browser acceptance and performance checks |
| `docs/` | Design specification, validation evidence and engineering plans |

## Evidence and browser support

[UI design and validation](docs/UI_DESIGN.md) records the current interface and checks. [Media validation](docs/SAMPLE_VALIDATION.md) and [Phase 4 validation](docs/phase4-validation.md) contain historical camera and engine evidence with their environments. [Next steps](docs/next-steps-plan.md) describes the remaining production-engine gates.

A passing Playwright WebKit run is not real Safari or physical iPhone qualification. Do not infer universal format support or compare performance numbers from different hosts. Unsupported capabilities and unavailable native video playback have explicit fallback states.

## License

Application code is [MIT](LICENSE). Codec binaries have separate licenses, including [GPL FFmpeg](packages/app/public/licenses/FFmpeg-GPL-2.0.txt) and [LGPL libheif](packages/app/public/licenses/libheif-LGPL-3.0.txt). MotionFlow attribution and all component notices are preserved in [NOTICE.txt](packages/app/public/licenses/NOTICE.txt).

Public binary distribution must satisfy the codecs' corresponding-source obligations. The MIT app license does not relicense those components.
