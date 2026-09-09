# PicForge — Agent Guide

## Current state

Working version **0.16.0**, browser-only image toolbox. The initial integration is implemented; no release/deployment is implied by the package version.

- **Image compression:** existing `@jsquash/*` pipeline, batch resize, global/per-image settings, compare/zoom previews and ZIP manifest.
- **Android Motion Photos:** binary JPG + MP4 extraction; no re-encoding or Apple engine loading. MotionFlow's separate app has been removed; its license remains.
- **iOS Live Photos:** basename pairing, HEIC → MozJPEG, MOV → H.264/AAC, clean-aperture crop/rotation, source timestamps or explicit 30 fps. Serial jobs, cancellation/retry, individual downloads and ZIP.
- **Historical media baseline (2026-09-06):** [validation report](docs/SAMPLE_VALIDATION.md). Phase 4 subsequently qualified the static Vips engine in Chromium/Firefox/Playwright WebKit on macOS and camera media in Chromium/Firefox; this does not constitute real Safari qualification. See [Phase 4 validation](docs/phase4-validation.md).

## Code map

- `packages/app/src/App.tsx`: shared header, tool navigation, update prompt. `CompressionWorkspace.tsx`: compressor with active-tool clipboard import; `components/WorkbenchLayout.tsx`: shared queue/viewer/inspector layout. Default and legacy home entries open the Landing Page; users select a tool. Explicit tool URLs still open that tool; visited queues persist across home and browser history.
- `packages/app/src/motion/`: grouping/extraction/encoder arguments (`media.ts`), worker lifecycle (`processor.ts`), HEIC worker and QuickTime clean-aperture adapter.
- Compression: Zustand `fileStore`/`settingsStore` → `useAutoCompress` → image-engine policy → compatibility engine → `packages/codecs`. Per-image settings are complete snapshots.
- UI: React 19 + Vite 8, native `app-shell.css`, shared theme, i18next with five locales. Keep translation keys/interpolation aligned across all locales.
- All packages are ESM; internal dependencies use `workspace:*` and export TypeScript source. Tooling/TypeScript is shared from the root.

## Commands and checks

- `pnpm install`; `pnpm dev` (127.0.0.1:5173); `pnpm build`; `pnpm preview`.
- Required before release: `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`. Woodpecker CI runs these gates. Vitest uses Node; mock browser APIs when needed.
- Media/PWA acceptance: `pnpm test:browser` (Playwright Chromium + native `ffprobe`). Select it when processing or shared runtime/asset/offline changes affect these paths; visual-only work does not require camera conversion. Artifacts default to a temporary directory. Override with `PICFORGE_BROWSER`, `PICFORGE_BROWSER_EXECUTABLE`, `PICFORGE_QA_OUTPUT`.
- Synthetic media smoke: `PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser` requires native `heif-enc`, `ffmpeg` (libx264/libx265) and `ffprobe`; all fixtures/exports stay temporary. Upgrade evidence: [Phase 1 validation](docs/phase1-validation.md).
- UI changes: verify actual desktop/mobile behavior; use [QA checklist](docs/QA_CHECKLIST.md) and [implemented visual baseline](docs/UI_DESIGN.md). With the dev server running, `node scripts/ui-check.mjs` checks synthetic UI cases without HEIC/MOV conversion; `PICFORGE_UI_GROUPS=entry` checks Landing/footer/language/history; `layout,interaction` checks the workbenches. `pnpm format` applies Prettier.

- Experimental wasm-vips: `pnpm test:vips` checks an isolated temporary build, dev loading, failure recovery and compatibility without isolation headers. It does not switch the default pipeline. See [Phase 2 validation](docs/phase2-validation.md) and [Phase 3 engine contract](docs/phase3-validation.md).
- Phase 4 engine: `pnpm test:vips:engine` qualifies JPEG/WebP transforms, color/alpha, settings, cancellation/crash/timeout and offline behavior in a temporary build. Requires ImageMagick; set `PICFORGE_SRGB_PROFILE` / `PICFORGE_P3_PROFILE` outside macOS for ICC fixtures. See [Phase 4 validation](docs/phase4-validation.md). Production still registers Compat only; thread/ownership constraints below apply to future integration.
- Private camera acceptance uses `PICFORGE_SAMPLE_ANDROID`, `PICFORGE_SAMPLE_IOS_HEIC` and `PICFORGE_SAMPLE_IOS_MOV`. `sample/` is ignored. Expected frames/PTS/crop/rotation come from the current source; recent native ffprobe with Frame Cropping support and ImageMagick are needed for arbitrary camera fixtures.

## Minimum constraints

1. **Privacy and workspace hygiene.** Sample media fixtures containing personal data must never be committed. Write exports/screenshots to temporary directories. Preserve unrelated working changes; do not commit, push or deploy without authorization.
2. **Everything stays local.** No uploads, telemetry or remote processing without product approval. Keep engines self-hosted and lazy; use bounded concurrency, worker cleanup and existing size/pixel guards. Prefer capability, initialization and qualification checks over UA sniffing; any temporary browser deny rule needs specific evidence, an issue/reference and a removal condition.
3. **Preserve media semantics.** Android exports must reconstruct original bytes. For iOS check main track, crop, rotation and per-frame PTS—not just nominal fps. The pinned FFmpeg needs the clean-aperture adapter; remove it only with a verified core upgrade. HEIC output is a web derivative, not an HDR/metadata-preserving archive. Basename matching is not Apple identifier verification.
4. **Preserve resize/settings behavior.** `contain` fits without upscaling; `cover` uses centered crop; `stretch` uses exact dimensions. Global edits must not overwrite per-image snapshots.
5. **Reproducible assets and offline behavior.** Dev/build run `packages/app/scripts/prepare-codecs.mjs`; codecs load from `/wasm/`. Keep `precache.json` generation and service-worker caching intact. Heavy engines work offline only after successful loading/caching. Do not commit generated engine copies, `dist/`, `node_modules/` or `*.tsbuildinfo`.
6. **Version and licenses.** Root/app versions must match; bump `CACHE_VERSION` in `packages/app/public/sw.js` when shipping a new version. Preserve notices under `packages/app/public/licenses/`: MIT app code does not relicense GPL FFmpeg/LGPL libheif. Satisfy codec source-distribution obligations before public binary distribution.
7. **Fallback and cancellation.** Keep the original Blob/File as the retry source; never fall back from a detached ArrayBuffer or pre-copy a full source buffer for fallback. AbortError, cancellation and stale task epochs must not trigger fallback, increment runtime failures, or publish results. Only explicitly classified infrastructure faults count toward the session breaker; corrupted/unsupported input does not. Bound retries and preserve one terminal outcome per task.
8. **Thread and memory ownership.** Use one shared Vips task lane. Keep the pinned pthread pool and `VIPS_MAX_THREADS` synchronized at six, with growth disabled, until a separate measured change qualifies another configuration. Preserve the AVIF/OxiPNG single-thread patches. Account for source and target pixels, resident engines and restart overlap; task completion or Worker target disappearance is not proof of immediate RSS/CPU recovery.

## Current priorities and evidence

- Prioritize measurable production-path performance, useful browser/runtime capabilities, and conversion/processing quality. Preserve completed Phases 0–4; do not repeat migrations or upgrade dependencies merely to chase newer versions. The next-step engineering proposal is [here](docs/next-steps-plan.md).
- Compare current/optimized Compat with Vips on the same host, browser, input bytes and equivalent output settings. Record actual selected engine, fallback, latency, output size and quality. Keep historical baselines immutable; do not compute a speedup by comparing the old Linux/Intel baseline with a new Mac run.
- Production remains Compat until the target Vips range has passed performance and real application integration gates. Initialization, correctness and an error circuit breaker do not detect successful-but-slow processing. Retain 60 MP as a safety-rejection case; do not bypass guards to obtain benchmark numbers.
- Preserve dimensions, crop/rotation, color/ICC, alpha and metadata-stripping behavior when optimizing. A faster or smaller output is not sufficient if quality or settings semantics changed. Remove buffer copies only after proving ownership, view bounds and lifetime. Do not conflate smaller explicit arrays with elimination of the browser's decoded bitmap.

## Validation proportional to the change

- During edits, run the directly affected checks. At a coherent implementation commit boundary, run lint/typecheck/unit/build once; documentation and concept-only changes need only appropriate content/diff checks.
- Keep fast unit tests and core Blob/cancellation/epoch/fault/thread regressions. Reduce repeated browser builds and broad matrix runs rather than deleting useful assertions. Reuse builds and select existing test subsets where supported; add only minimal filtering when missing.
- Match browser evidence to the change: geometry/options → affected cases; lifecycle/threads → cancellation/recovery; Vite/WASM/SW/headers → dev/production/304/no-isolation/offline; visual work → desktop/mobile, focus and relevant interactions. Repeat real Motion/Live Photo conversion only when its implementation, a relevant shared dependency/runtime, or release qualification warrants it.
- Preserve valid, unaffected prior evidence with its source revision. No unconditional retries, unrelated full-suite reruns, or benchmark collection alongside heavy tests. Expand coverage for an actual failure, unresolved risk, dependency change or default-engine/release decision.

## Unified visual design

- The latest user request replaces the green optical prototypes. Use [the current brief](docs/design/editorial-redesign.md), [tokens](docs/design/design-tokens.json), and [implementation/QA baseline](docs/UI_DESIGN.md). The previous optical report is preserved in [UI_DESIGN.optical-2026-09-09.md](docs/UI_DESIGN.optical-2026-09-09.md); it is historical evidence, not the current visual specification.
- Use neutral white/graphite viewing surfaces, restrained vermilion actions, flat file rows, consistent 4–6px controls and system fonts. No particle loop, cursor halo, glass refraction or green theme. Do not filter source, preview or exported media pixels.
- Home has three direct tool links and a labelled generated sample comparison. On phones, tool entries precede the sample. The sample can be opened in the real compressor. No illustrative values may be presented as measurements.
- Preserve per-tool queues across home and browser history, global/per-image settings provenance, compare/zoom, cancellation, retry and downloads. Desktop uses queue/viewer/inspector panes; mobile uses file-list/preview navigation with settings below and stable batch actions.
- Use native selects and dialogs. Number fields accept temporary drafts, apply on blur/Enter and cancel with Escape. Preview controls stay outside the image and remain available in fullscreen. PNG clearly identifies its lossless behavior.
- Keep all five locales aligned. Browser language is the default with English fallback; persist only explicit choices under `picforge.language`. URL previews and the legacy detector cache must not override automatic detection. Theme follows the system until explicitly chosen; unavailable storage must not break rendering.
- Landing footer is centered copyright/GitHub plus sponsorship on a separate line. Do not restore About or a raw license link to the primary footer. Preserve all license files and attribution, including removed historical components.
- Keep screenshots/exports/private samples temporary. The committed dune assets are generated, non-personal examples; attribution and generation/encoding details are in the design brief. Keep visual concepts distinct from implemented capabilities and measured results.
