# PicForge — Agent Guide

## Current state

Working version **0.15.0**, browser-only image toolbox. The initial integration is implemented; no release/deployment is implied by the package version.

- **Image compression:** existing `@jsquash/*` pipeline, batch resize, global/per-image settings, compare/zoom previews and ZIP manifest.
- **Android Motion Photos:** binary JPG + MP4 extraction; no re-encoding or Apple engine loading. MotionFlow's separate app has been removed; its license remains.
- **iOS Live Photos:** basename pairing, HEIC → MozJPEG, MOV → H.264/AAC, clean-aperture crop/rotation, source timestamps or explicit 30 fps. Serial jobs, cancellation/retry, individual downloads and ZIP.
- **Verified baseline (2026-09-06):** Chromium conversion/playback/offline reload and Firefox conversion/static-preview fallback. Safari/WebKit is unverified (local WebKit lacks `libicudata.so.74`). Timing/size measurements and limits: [validation report](docs/SAMPLE_VALIDATION.md).

## Code map

- `packages/app/src/App.tsx`: shared header, tool navigation, update prompt. `CompressionWorkspace.tsx`: original compressor, active-tool clipboard import.
- `packages/app/src/motion/`: grouping/extraction/encoder arguments (`media.ts`), worker lifecycle (`processor.ts`), HEIC worker and QuickTime clean-aperture adapter.
- Compression: Zustand `fileStore`/`settingsStore` → `useAutoCompress` → image-engine policy → compatibility engine → `packages/codecs`. Per-image settings are complete snapshots.
- UI: React 19 + Vite 8, native `app-shell.css`, shared theme, i18next with five locales. Keep translation keys/interpolation aligned across all locales.
- All packages are ESM; internal dependencies use `workspace:*` and export TypeScript source. Tooling/TypeScript is shared from the root.

## Commands and checks

- `pnpm install`; `pnpm dev` (127.0.0.1:5173); `pnpm build`; `pnpm preview`.
- Required before release: `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`. Woodpecker CI runs these gates. Vitest uses Node; mock browser APIs when needed.
- Media/PWA changes: `pnpm test:browser` (Playwright Chromium + native `ffprobe`). This builds, previews and checks acceptance when fixtures are provided; artifacts default to a temporary directory. Override with `PICFORGE_BROWSER`, `PICFORGE_BROWSER_EXECUTABLE`, `PICFORGE_QA_OUTPUT`.
- Synthetic media smoke: `PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser` requires native `heif-enc`, `ffmpeg` (libx264/libx265) and `ffprobe`; all fixtures/exports stay temporary. Upgrade evidence: [Phase 1 validation](docs/phase1-validation.md).
- UI changes: verify actual desktop/mobile behavior; use [QA checklist](docs/QA_CHECKLIST.md). `pnpm format` applies Prettier.

- Experimental wasm-vips: `pnpm test:vips` checks an isolated temporary build, dev loading, failure recovery and compatibility without isolation headers. It does not switch the default pipeline. See [Phase 2 validation](docs/phase2-validation.md) and [Phase 3 engine contract](docs/phase3-validation.md).

## Minimum constraints

1. **Privacy and workspace hygiene.** Sample media fixtures containing personal data must never be committed. Write exports/screenshots to temporary directories. Preserve unrelated working changes; do not commit, push or deploy without authorization.
2. **Everything stays local.** No uploads, telemetry or remote processing without product approval. Keep engines self-hosted and lazy; use bounded concurrency, worker cleanup and existing size/pixel guards.
3. **Preserve media semantics.** Android exports must reconstruct original bytes. For iOS check main track, crop, rotation and per-frame PTS—not just nominal fps. The pinned FFmpeg needs the clean-aperture adapter; remove it only with a verified core upgrade. HEIC output is a web derivative, not an HDR/metadata-preserving archive. Basename matching is not Apple identifier verification.
4. **Preserve resize/settings behavior.** `contain` fits without upscaling; `cover` uses centered crop; `stretch` uses exact dimensions. Global edits must not overwrite per-image snapshots.
5. **Reproducible assets and offline behavior.** Dev/build run `packages/app/scripts/prepare-codecs.mjs`; codecs load from `/wasm/`. Keep `precache.json` generation and service-worker caching intact. Heavy engines work offline only after successful loading/caching. Do not commit generated engine copies, `dist/`, `node_modules/` or `*.tsbuildinfo`.
6. **Version and licenses.** Root/app versions must match; bump `CACHE_VERSION` in `packages/app/public/sw.js` when shipping a new version. Preserve notices under `packages/app/public/licenses/`: MIT app code does not relicense GPL FFmpeg/LGPL libheif. Satisfy codec source-distribution obligations before public binary distribution.
