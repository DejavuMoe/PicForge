# PicForge QA Checklist

This checklist captures the main manual and browser-based checks for each release or UI/UX pass.

## Core Flow

- Empty state shows the drop zone and accepts click, drag-and-drop, and paste.
- File queue stays usable with 1, 10, 50, and 100 images.
- Processing continues when one image fails, and failed images can be retried.
- Global settings changes reprocess global files without overwriting custom image snapshots.
- Custom image settings show a visible custom marker and can be restored to global settings.

## Preview

- Slider, side-by-side, and single-image modes render non-empty images.
- Side-by-side labels, toolbar, metadata badges, and divider do not scale with image zoom.
- Press-and-hold zoom focuses the clicked image point, dragging pans while pressed, and release returns to fit.
- Resized images show original and output dimensions clearly without floating mini-image overlays.
- Mobile preview has reachable back, previous, next, mode, and zoom controls.

## Export

- Current-image download uses the effective global or custom output format extension.
- ZIP export includes all completed images, unique duplicate names, and `picforge-manifest.json`.
- Manifest records app version, generated timestamp, source id, original/output names, settings mode, settings hash, dimensions, sizes, and compression ratio.

## Performance

- Large images are rejected with a clear error before decode when above configured safety limits.
- Batch processing does not permanently stall after a worker error, timeout, cancel, or retry.
- Object URLs are revoked when files are removed, results are replaced, settings trigger reprocessing, or the queue is cleared.
- Initial load does not include ZIP generation libraries until the user downloads.

## Responsive And Accessibility

- Layout is usable at 375x667, 390x844, 768x1024, 1280x720, and 1440x900.
- Keyboard can focus the drop zone, file rows, toolbar controls, preview controls, and download actions.
- Status updates are announced through a polite live region.
- Text does not overflow buttons, rows, panels, or the status bar in English, Simplified Chinese, Traditional Chinese, Japanese, and Korean.
- CJK/Japanese/Korean text renders without missing glyphs or awkward fallback metrics.

## PWA And Offline

- Production build registers `/sw.js`.
- App installs with the PicForge name and icon.
- After the first online load, refresh works offline.
- Font, WASM, and built assets are served from cache when offline.
- A service worker version change removes old PicForge caches.
- A service worker version change shows the in-app new-version refresh prompt.

## Motion Preferences

- With reduced motion enabled, skeletons, spinners, progress stripes, and transitions do not animate continuously.
