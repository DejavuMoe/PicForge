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
- Shared language/tool/format comboboxes have themed popups and support keyboard and touch input.
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

## Detail regression checks

- Home number, title, description, format and arrow columns share the same x positions across rows, including different text lengths and all five locales.
- Home rows retain symmetric 20 px desktop/tablet and 12 px mobile insets; the first/last controls do not touch the separator edges.
- Quality and percentage sliders align with their number fields in enabled and disabled states. No rectangular input background appears behind a disabled track. Fill follows the thumb center at both endpoints and between them.
- Open/close Advanced settings and Presets at 1160×571 and 1576×828; fields retain width when a scrollbar appears. Verify the same behavior on tablet/mobile and with a selected result/download footer.
- Closed selects show the application's chevron and deliberate hover/focus/disabled states. Number controls do not reveal browser-specific spinner buttons on hover.
- The language picker contains exactly five languages and no automatic option. Initial browser detection still works; explicitly choosing the current language persists that choice.
- Enter commits and Escape cancels numeric drafts without losing focus. Tab continues to the next control.
- Touch/non-hover inputs do not receive sticky desktop hover decoration, and keyboard focus is still visible.
- Run `PICFORGE_UI_GROUPS=details,usability node scripts/ui-check.mjs` for these targeted regressions; results include measured column/disclosure drift.

## Complete controls and footer review

- Open every selector on home/compression/Android/iOS, including advanced options and fullscreen zoom. Verify actual popup colors, bounds, keyboard search/arrows/Escape/Tab and disabled behavior.
- Click and drag the home comparison, then move away: neither the image nor its handle retains a focus frame. Keyboard arrows show focus on the handle only.
- All pages have a single top-right GitHub icon. Copyright and Riven Cloud remain visible; desktop aligns them to opposite sides, mobile stacks and centers them.
- No native select, title tooltip or video control UI appears in the web page. Verify app hints and synthetic-video play/pause/seek/mute/hidden-tool pause, or a clear fallback with a valid download.
- Use `PICFORGE_UI_GROUPS=controls,video` with `PICFORGE_UI_VIDEO` pointing to a temporary synthetic MP4. Do not infer video qualification from a UI-only run.
- In both media tools, check portrait/landscape results at desktop, tall desktop, tablet and 320/390 px widths. The dock must match the **visible video** on both sides and sit directly below the picture, not span its enclosing pane. Narrow players give the timer its own row; measure rendered text, not only the text container. Paired visible media and downloads align, including small inputs that must not upscale.
- The photo strip follows the photo's edges, displays its actual output dimensions and matches the paired video dock height on desktop. Test its fullscreen button by keyboard, keep controls reachable in fullscreen, and check restoration on exit. Photo-only results and 320/390 px phone layouts retain this behavior; use the `photo` group without video fixtures.
- Check sub-second completion, continuous playback, paused scrubbing, dragging during playback, keyboard endpoints and switching tools while playing. Delayed video events must not overwrite the dragged thumb. Hidden tools stop playback and timeline updates.
- Use `PICFORGE_UI_GROUPS=ranges` for shared enabled/disabled range geometry and `PICFORGE_UI_GROUPS=player` with `PICFORGE_PLAYER_FIXTURES` for temporary portrait/landscape JPEG/MP4 pairs; fixture dimensions and durations are specified in [the validation report](UI_DESIGN.md).
