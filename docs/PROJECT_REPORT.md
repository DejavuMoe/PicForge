# PicForge Project Report

> Version: 0.14.0 | Updated: 2026-06-30

## Overview

PicForge is a privacy-first browser app for batch image compression. Users add local images, adjust global or per-image settings, compare output quality, and export single files or ZIP packages. No image upload or server-side processing is required.

Demo: [picforge.de](https://picforge.de)

## Current Stack

| Area       | Technology                                         |
| ---------- | -------------------------------------------------- |
| UI         | React 18, native app-shell CSS, react-icons        |
| State      | Zustand                                            |
| Build      | Vite 5, pnpm workspace                             |
| Processing | Canvas APIs, Web Workers, `@jsquash/*` WASM codecs |
| Export     | JSZip, FileSaver, manifest metadata                |
| i18n       | i18next, react-i18next                             |
| Tests      | Vitest, TypeScript checks                          |

## Packages

```text
@pic-forge/app
  UI shell, stores, i18n, export flow, PWA registration

@pic-forge/codecs
  Compression settings, codec defaults, WASM loader

@pic-forge/worker
  WorkerPool, decode/resize helpers, worker encode entry
```

## Key Capabilities

- Batch add by click, drag-and-drop, folder drop, or paste.
- Automatic compression when files or settings change.
- Complete per-image settings snapshots with restore-to-global behavior.
- MozJPEG, WebP, OxiPNG, and AVIF output.
- Slider, side-by-side, and single-image preview modes.
- Click-to-inspect zoom, 2x pan, and non-scaling metadata overlays.
- ZIP export with `picforge-manifest.json`.
- PWA install and offline refresh after first load.
- Five app locales: English, Simplified Chinese, Traditional Chinese, Japanese, Korean.

## Release State

The project is ready for GitHub open-source release preparation. Remaining release work is mostly operational: keep CI green, verify public docs, capture current screenshots, and avoid publishing local artifacts.

## Known Limits

- Decode and resize still rely on browser APIs on the main side before worker encoding.
- Very large batches can still be memory intensive; decode/resize is conservatively bounded on the main thread and should be revisited with browser smoke tests.
- AVIF encoding is naturally heavy and depends on browser WASM performance.
- The project is not packaged for npm publication.
