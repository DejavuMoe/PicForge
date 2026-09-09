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
- In slider mode, the divider stays aligned with the real split boundary at fit zoom and after pan/zoom.
- In slider mode, dragging near the divider still adjusts the split when the image is zoomed in.
- Side-by-side labels, toolbar, metadata badges, and divider do not scale with image zoom.
- Press-and-hold zoom focuses the clicked image point, dragging pans while pressed, and release returns to fit.
- Resized images show original and output dimensions clearly without floating mini-image overlays.
- Mobile preview has reachable back, previous, next, mode, and zoom controls with 44px targets.
- Fullscreen keeps the preview controls available; zoom does not scale UI labels.
- Preview tools do not obscure image pixels; no decorative filter reaches media.
- PNG disables the ineffective quality control and explains lossless output.
- Result summaries use actual sizes and distinguish larger files from savings.

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

- Layout is usable at 320x844, 375x667, 390x844, 768x1024, 1280x720, and 1440x900.
- On phones, all three home tool entries are reachable before the sample comparison.
- Native language/tool/format selects support platform keyboard and touch pickers.
- Numeric fields accept empty drafts, commit on blur/Enter, and restore on Escape.
- System theme changes and disabled local storage do not break the page.
- File selection and row actions are separate buttons; keyboard focus remains visible.
- Keyboard can focus the drop zone, file rows, toolbar controls, preview controls, and download actions.
- Status updates are announced through a polite live region.
- Text does not overflow buttons, rows, panels, or the status bar in English, Simplified Chinese, Traditional Chinese, Japanese, and Korean.
- CJK/Japanese/Korean text renders without missing glyphs or awkward fallback metrics.

## PWA And Offline

- Production build registers `/sw.js`.
- App installs with the PicForge name and icon.
- After the first online load, refresh works offline.
- WASM and built assets are served from cache when offline; no unused fonts are precached.
- A service worker version change removes old PicForge caches.
- A service worker version change shows the in-app new-version refresh prompt.

## Motion Preferences

- With reduced motion enabled, skeletons, spinners, progress stripes, and transitions do not animate continuously.

## Toolbox

- Run `pnpm test` and `pnpm test:browser` (when test media is supplied).
- Android exports reconstruct source bytes; no HEIC/FFmpeg engine loads for extraction.
- Apple pairing handles lone files and duplicate basenames explicitly.
- Check clean aperture, orientation, primary track, audio and per-frame PTS in the actual WASM output.
- Cancel/retry retains completed results; ZIP members equal individual downloads.
- Unsupported native video playback shows a static fallback and download message.
- Offline reload after successful engine caching can process media again.
- Recheck original image compression and both narrow/wide viewport layouts.
- See `SAMPLE_VALIDATION.md` for measured results and unverified platforms.

## Current UI automation

Run `PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs` against the dev server. Select `PICFORGE_UI_BROWSER=chromium|firefox|webkit`; browser binaries must match the pinned Playwright version. Reuse a built app with `PICFORGE_UI_URL` when appropriate. Screenshots and exports go to a temporary directory by default.

Record exact engines, dimensions and limitations. A structural invalid MP4 deliberately tests native-playback fallback in the interaction group. If a native browser process aborts, record that failure separately; do not call the full media path qualified just because the other groups pass. See [current validation](UI_DESIGN.md) for the Linux WebKit limit and the unchanged historical camera evidence.
