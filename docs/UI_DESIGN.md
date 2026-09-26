# PicForge interface

Current working version: **0.17.0** working tree, 2026-09-26, uncommitted on `dd63bd8`. This implements the [darkroom ledger](design/darkroom-ledger.md) visual system and replaces the editorial/vermilion workbench. The previous baseline and its evidence are preserved in [UI_DESIGN.editorial-2026-09-26.md](UI_DESIGN.editorial-2026-09-26.md). No deployment is implied.

## Structure

- **Header** (52 px; 56 px on phones): folded-P tile and wordmark (home link), indexed tool navigation `01 Compress · 02 Motion Photo · 03 Live Photo` with an amber rule under the current tool, GitHub, a fixed-width language picker with exactly five languages, and theme. Phones show the tile, a themed tool picker, GitHub and a preferences menu containing language and theme. The tool heading band is gone. Each tool keeps a visually hidden `h1#pf-main` for the skip link and headings.
- **Workbench grid**: `queue | stage | inspector` above `batch | stage | inspector` (288 px / flexible / 312 px). Tablet (768–1100 px) shares one column between queue and stage (explicit back action) with a 288 px inspector. Phones use one scrolling column. The list view shows the queue and settings; the preview view shows the stage, settings and the per-image ledger. The batch ledger is sticky at the bottom.
- **Status line** (32 px): copyright left, `■ Local processing · v{version}` centred, Riven Cloud right. On phones, copyright is centred above sponsorship. It is shared by home and all tools; there are no About or licence links.

## Surfaces and stage

Chrome uses the paper/ink tokens. `WorkbenchLayout` adds `.pf-stage-scope` to the preview panel once media exists. The scope remaps the paper/ink tokens to hue-free graphite, so the view bar, zoom select, docks and processing card follow automatically. The empty drop sheet remains on paper. The landing sample uses the same scope.

The compression viewport keeps a mat (`--pf-mat-x/y`: 32/36 px desktop, 14/32 px phone). `.pf-plate`, labels, the info line and the split line derive the fitted image box from the viewport or pane container size, the mat and the intrinsic size (`--pf-source-*` / `--pf-result-*`). They use the same constraints as the image, so marks and labels never cover pixels at fit zoom. When zoomed, the marks and info line hide; labels become corner chips, the only overlap. A checkerboard is visible only through transparent pixels.

## Controls

- **Buttons**: primary (amber fill, ink text), default (raised paper, control line), danger (alert) and text buttons, which get an amber underline on hover. Icon buttons are 32 px, 44 px on phones and coarse pointers. Hover exists only for fine pointers.
- **Themed combobox** for tool, language, resize method, advanced options and zoom. The popup is portaled and viewport-clamped. A scroll now closes it only if the trigger actually moved. Previously, the scroll caused by focusing a trigger below the fold arrived after the popup opened and closed it, so the next Enter reopened instead of choosing (reproduced in Chromium at 1160×571).
- **Format** is a radio rail (JPEG · WebP · PNG · AVIF) with roving focus; arrow keys and Home/End move focus and selection together. PNG disables quality and states that it is lossless.
- **Presets** are four visible recipes (label plus `format · quality`) above the format; the recipe matching the current format, quality and its own advanced options is marked. Reset (global scope only) sits beside the heading.
- **Rails** (scope, view switch, resize mode): the pressed segment is set in ink.
- **Switch**: rectangular, amber when on. **Range**: 2 px rule with amber fill and a square ink thumb; it has the same height and top edge as its number field.
- **Numbers**: set in Plex Mono; drafts apply on blur or Enter and are cancelled with Escape, keeping focus.
- **Disabled/locked** controls use dashed control lines and ink-3 labels and stay readable.
- **Focus**: a 2 px outline only in keyboard mode (`data-pf-input`), ink on paper and amber on dark or stage. Pointer interaction leaves no frame.

## Compression

- **Queue rows**: 44 px thumbnail, name (tooltip), status with a done square or mono progress, a Custom tag, `source → result` in mono with the signed change, then the size bar (the filled share is the remaining size). Processing uses the same slot for amber progress. Actions sit in the name row; the selected row has an amber edge.
- **Batch ledger**: `n / m completed`, failures, export errors, Cancel processing, batch totals `source → result ±%` over exportable results, and the primary Download results.
- **Stage header**: file name, `dimensions · sizes · output format` facts and previous/next.
- **View bar**: Original · Result · split · two-up, zoom (−, level, +) and full screen. On phones it wraps into two rows with 44 px targets.
- **Inspector footer ledger**: source format and dimensions with size; result format and dimensions with size; the size bar; the saved share (or "No result yet"); Download this image. The field edges align with the download button.

## Motion and Live Photo

Paired print panes show the caption (`PHOTO · JPG`), media, an optional note and the download row. Desktop aligns rows through subgrid. The photo strip is fitted to the rendered picture and shows its true pixel dimensions. `VideoPlayer` sizes the video dock to the visible frame plus dock. On phones the frame hugs the fitted media: the limit is read from the frame's `max-height`, and landscape media no longer leaves empty bands. A video that loads metadata without a frame size (undecodable track, e.g. HEVC in Chromium) now uses the still-image fallback and its note. Previously the dock took the poster box, which was wider than the visible still.

The Android inspector lists the output files with sizes and downloads plus the no-re-encoding note. The iOS inspector shows preset, frame rate, JPEG quality and audio, locked but legible after conversion. The batch ledger carries the count, New batch, process/extract or cancel, and Download results.

## Landing

The title has a signal square, followed by the summary and the local-processing line. The real JPEG/WebP sample slider sits on a graphite plate with registration marks; its note and Try sample are below. Under a heavy ink rule, the tool index has five aligned columns: index, name, description, formats and arrow. Insets are symmetric: 20 px on desktop and tablet, 12 px on phones. On phones the index precedes the sample and fits the first 844 px.

## Assets and fonts

- IBM Plex Sans Variable (Latin 45.7 kB, Latin Extended 31.0 kB) and IBM Plex Mono 400/500 (14.7/14.9 kB) come from `@fontsource-variable/ibm-plex-sans@5.3.0` and `@fontsource/ibm-plex-mono@5.3.0` (exact pins). They are referenced by `styles/tokens.css` and emitted as hashed assets. `precache.json` and `verify-site-output.mjs` now accept `.woff2`. The OFL notice is in `public/licenses/IBM-Plex-OFL-1.1.txt` and `NOTICE.txt`. The CSP already allows `font-src 'self'`.
- Production CSS: `index-*.css` 59.7 kB (11.2 kB gzip) plus the lazy `Landing-*.css` 6.5 kB, versus 52.3 kB + 4.8 kB in the previous build (2026-09-20 output of the unchanged `app-shell.css`). The fonts add 106.3 kB to the precache; browsers download only the subsets a page uses.
- Brand: the recoloured master, `logo-tile.svg` header mark, favicon `?v=ledger`, icons and Plex-outlined share cards are regenerated by `pnpm assets:brand` ([brand.md](design/brand.md)). The maskable-icon check in `browser-check.mjs` now measures against the ink tile.

## Validation (2026-09-26, WSL Chromium 145.0.7632.6, Playwright 1.58.2)

| Check | Result |
| --- | --- |
| `pnpm lint` | 0 errors; the 7 existing `any` warnings |
| `pnpm test` | 31 files, 280 tests pass |
| `pnpm test:build` · `pnpm typecheck` | 23 pass · pass |
| `pnpm build` + `verify-site-output.mjs` | pass; 78 files checksummed; 4 WOFF2 files in the precache |
| `browser-check.mjs` (production, approved samples) | all PASS: SW/cache policy, CSP, compression download/mobile/offline, PNG passthrough, animated WebP, Android/iOS extraction, pairing, cancellation/retry, conversion, timestamps, offline conversion and brand metadata/maskable safe area |
| `ui-check.mjs` groups `entry, layout, interaction, usability, details, controls, ranges, photo` | pass. `controls` first failed on the keyboard-select defect above. The final run of every group, on the final tree, passes |
| `player` (temporary H.264 320×426/0.8 s and 480×320/2 s fixtures), `video` | pass. Dock/video edges, paired media and downloads, compact timer, full screen, sub-second updates, scrubbing and hidden-tool pause. Final run passes |

Design captures covered desktop 1440×900 in light and dark, tablet 900×1100, phone 390×844 @2x and Simplified Chinese 1280×800: home, compression (empty, done, two-up, settings, zoom, menu, dialog), Android (approved sample) and iOS (approved HEIC/MOV). They were inspected and kept in a temporary directory; approved camera media is not committed or published. The README screenshots were refreshed from synthetic dune fixtures ([capture notes](assets/readme/README.md)).

Updated test hooks: the format is selected through `radiogroup "Format"`. The presets are `.pf-preset` recipes; the old presets `<details>` is gone. Keyboard and hover combobox checks use `Resize method`. The old `.pf-workspace-heading`, `.pf-preview-tabs`, `.pf-compare-mode-*` and `.pf-result-summary` classes no longer exist.

Not run for this change: Firefox and WebKit UI groups, real Safari/iOS, low-memory devices and performance benchmarks. Media processing code is unchanged apart from the video fallback and the phone frame sizing.
