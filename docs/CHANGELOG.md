# Changelog

All notable changes to PicForge are documented here.

## [Unreleased]

- Evolve the local app into a three-tool workspace: image compression, Android Motion Photo extraction, and iOS Live Photo conversion (working version 0.15.0).
- Add lazy HEIC/FFmpeg workers, pairing, cancellation/retry, clean-aperture handling, source-timestamp export, ZIP and native-preview fallback.
- Fix first-visit offline app caching and add sample-driven browser checks.
- Consolidate project guidance; remove obsolete compressor documentation, unused helper exports/loading styles, duplicate TypeScript declaration and stale sharp build permission.

### Fixed (post-0.17.0 review)

- HEIC → JPEG converts Display P3 (and other matrix/TRC ICC or nclx) colours to sRGB instead of writing P3 values into an untagged JPEG; LUT-only profiles are embedded.
- Advanced encoder options no longer leak across formats or accumulate across presets (WebP lossless silently made AVIF lossless; leftover JPEG keys rejected GIF → WebP). Presets replace format/quality/advanced and keep resize.
- Errors caused by settings (target size, animation format/settings/limits) recover when settings change; timeouts are no longer auto-repeated; cancelling a batch keeps permanent failures visible.
- Dropped folders are read (entries are taken during the drop event); `.AAE` and other sidecars no longer block their Live Photo pair.
- The service worker no longer takes over open pages by itself: updates wait for the prompt, the previous version's hashed modules stay for one generation (fixed URLs such as codec WASM and index.html always come from the current version), and versioned FFmpeg/HEIF engines keep their cache across app updates.
- A file retried while its cancelled task was still decoding no longer stays pending; a Worker that fails to start fails only its task; unreadable folder entries no longer discard a whole drop; FFmpeg's own exec limit reports a timeout rather than a decode error.
- Engine download/compile time no longer counts toward the animation and Live Photo conversion watchdogs.

### Changed

- Compression scheduling uses a page-wide memory budget shared with animation and Live Photo jobs, runs up to the encoder-pool size (previously 2) and processes the selected image first.
- Compat Workers start on demand, are retired after large tasks and are released when idle; encode watchdogs scale with target pixels above the previous floors.
- Opaque PNG → PNG without resizing optimises the original image data (exact 16-bit samples, no main-thread decode) after stripping metadata chunks; other PNGs keep the Canvas path, and a passthrough rejected by OxiPNG retries once through it.
- HEIC decoding and JPEG encoding run in separate Workers; Live Photo videos are read through WORKERFS instead of being copied into memory.
- Live Photos pair by Apple content identifier when both halves contain one, flag identifier mismatches, and pair renamed halves by identifier.
- Production HTML carries a Content Security Policy that confines fetch, beacons, images, media, fonts, frames and forms to this origin.
- Settings identity uses a 53-bit hash; removed the never-dispatched `wasm-loading` event, unused pool/store helpers and the Worker-incompatible Canvas encoder fallback.


## [0.17.0] - 2026-09-11

### Added

- Convert GIF/APNG to animated WebP with frame timing, finite/infinite loops, transparency and resizing preserved.
- Run animation decoding, APNG compatibility adapters and WebP encoding in a dedicated Worker using the existing self-hosted FFmpeg core.
- Add animation correctness, cancellation, browser/offline and same-host performance checks.

### Fixed

- Prevent animated inputs from silently becoming a single static frame; changing an unsupported output setting to WebP resumes processing.
- Preserve APNG separate posters, partial frames, transparent disposal and the final frame duration.
- Share the heavy processing lane with Live Photos and release completed task outputs.

### Changed

- Remove the redundant GIF/APNG hint beneath the format selector.
- Update app/package and PWA cache versions to 0.17.0.

## [0.14.1] - 2026-07-06

### Changed

- `pnpm dev` and `pnpm preview` now bind to `127.0.0.1` by default to avoid localhost IPv4/IPv6 mismatches on Windows.
- The slider compare view now keeps the visible divider aligned with the actual masked split while zooming and panning.
- The empty-state upload surface now lets users choose the output format before importing images, avoiding an unnecessary first compression pass for large batches.

### Fixed

- Slider compare remains draggable near the divider even when the preview is zoomed in.
- The empty-state output format selector now follows the active light/dark theme tokens instead of using a washed-out fixed light background in dark mode.
- Removed process-only planning and release-note documents from the repo-facing docs set to keep the documentation surface focused on long-lived references.

## [0.14.0] - 2026-06-30

### Added

- GitHub open-source release metadata, MIT license, issue templates, PR template, contribution guide, and security policy.
- PWA manifest, install icons, service worker cache, SEO metadata, and offline app-shell support.
- Foreground PWA update prompt for newly available service worker versions.
- Export manifest for ZIP downloads with settings mode, settings hash, dimensions, sizes, and compression ratio.
- Browser and unit test coverage for stores, preview helpers, processing guards, export manifest, worker pool, and file utilities.
- ESLint and Prettier project configuration plus a root type-check script.
- Localized README documentation for every supported app language.

### Changed

- Rebuilt the app shell with native React components and CSS for header, toolbar, file list, preview, single-image settings, and status bar.
- Updated preview UX with slider, side-by-side, and single-image modes plus click-to-inspect zoom, 2x pan, and fixed overlay layers.
- Stabilized complete per-image settings snapshots and restore-to-global behavior.
- Reduced production app runtime surface by removing the previous UI runtime dependency and related manual chunking.
- Updated README and core docs to reflect the current architecture and release posture.
- Replaced the README screenshot with a cleaner project preview asset.

### Fixed

- Quality and percentage sliders in single-image settings now commit immediately and reliably trigger reprocessing.
- Mobile workspace switching, preview back navigation, and side-by-side column layout no longer overflow at 390px.
- Large image guards, worker retry/cancel behavior, object URL cleanup, and ZIP filename uniqueness are covered by tests.
- `cover` resize now fills the target dimensions with centered crop instead of behaving like an oversized contain.

## [0.13.0] - 2026-06-22

### Added

- Two-panel batch workspace with file list, preview area, toolbar, and status bar.
- WorkerPool-based WASM encoding pipeline using `@jsquash/*` codecs.
- Automatic compression when files or settings change.
- Per-image custom settings and restore-to-global flow.
- Five-language interface: English, Simplified Chinese, Traditional Chinese, Japanese, and Korean.

## [0.12.0] - 2026-06-22

### Added

- Auto-compress workflow with debounced settings changes.
- Per-image editing foundation and preview comparison.
- ZIP export and single-file download actions.

## [0.11.0] - 2026-06-22

### Added

- Initial WorkerPool implementation.
- Compression presets and size comparison UI.
- WebP SIMD detection path.

## [0.10.0] - 2026-06-22

### Changed

- UI polish, responsive layout fixes, and animation cleanup.
- Initial advanced settings surface for codec options.
