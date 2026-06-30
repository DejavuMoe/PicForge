# Changelog

All notable changes to PicForge are documented here.

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
