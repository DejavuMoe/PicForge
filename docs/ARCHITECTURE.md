# PicForge Architecture

> Last updated: 2026-07-06 | Version: 0.14.1

PicForge is a browser app for local batch image compression. The app shell, state model, image processing pipeline, preview workspace, and export flow all run on the client.

## Runtime Shape

```text
main.tsx
  -> ThemeProvider
  -> App
     -> Header
     -> Toolbar
     -> Workspace
        -> FileList / FileRow
        -> Preview / FileSettingsPanel
     -> StatusBar
```

The app shell is React plus native CSS. It uses responsive panels instead of route changes: desktop shows file list and preview together; mobile switches between list and preview with a back control.

## Packages

| Package           | Responsibility                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `packages/app`    | UI, Zustand stores, i18n, PWA registration, export manifest, browser QA surface.                |
| `packages/codecs` | Shared compression types, default codec options, WASM codec loading, SIMD-aware WebP selection. |
| `packages/worker` | Decode/resize helpers, WorkerPool scheduling, worker entry, encode orchestration.               |

## Data Flow

```text
Add files
  -> fileStore.addFiles()
  -> App selects an image
  -> useAutoCompress watches pending files and settings
  -> effective settings = file custom snapshot or global settings
  -> decodeImage() with browser APIs
  -> resizeImage() when enabled
  -> WorkerPool.enqueue() for WASM encoding
  -> updateFile() stores result, preview URL, dimensions, and stats
```

The settings model has two layers:

- Global settings live in `settingsStore`.
- Per-image overrides are complete snapshots stored on the file record. Restoring global mode removes the snapshot and reprocesses the file with global settings.

## Preview Workspace

Preview supports three modes:

- Slider compare for same-size output.
- Side-by-side compare for resized output or detail inspection.
- Single-image preview for inspecting output alone.

Zoom and pan are applied through CSS variables on the image layer. In slider mode, the compressed image is masked at the viewport layer so the split boundary stays aligned with the visible divider during zoom and pan. Labels, metadata badges, dividers, and toolbars live in separate overlay layers so they do not scale with the image.

## Export

Single-image download uses the selected file's effective output format. ZIP export writes completed images plus `picforge-manifest.json`, including source name, output name, settings mode, settings hash, dimensions, sizes, and compression ratio.

## PWA And Assets

Production builds register `/sw.js`. The service worker caches the app shell, fonts, public WASM files, and generated build assets for offline refresh after the first successful load.
