# PicForge interface

The interface uses the [darkroom ledger](design/darkroom-ledger.md) visual system: warm paper and ink chrome, safelight amber controls, and a neutral graphite stage. See the [QA checklist](QA_CHECKLIST.md) for browser checks and [validation guide](validation.md) for test commands and evidence boundaries.

## Structure

- **Header:** folded-P tile and wordmark linking home, indexed tool navigation, GitHub, five-language picker and theme. Phones use a tool picker and a preferences menu. Each tool has a visually hidden `h1#pf-main` for the skip link and heading structure.
- **Desktop:** 288 px queue, flexible stage and 312 px inspector; the batch ledger sits under the queue. At 768–1100 px the queue and stage share a column, with an explicit back action and a 288 px inspector.
- **Phones:** one scrolling column. List view shows the queue and settings; preview view shows the stage, settings and per-image ledger. Batch actions remain sticky at the bottom. Touch controls have 44 px targets.
- **Footer:** copyright, local-processing/version status and Riven Cloud sponsorship. Desktop distributes them across the width; mobile centres copyright above sponsorship.
- **Navigation:** home, direct tool URLs and browser Back/Forward preserve visited tool queues. Reloading or closing the page clears files and results.

## Stage and previews

`WorkbenchLayout` adds `.pf-stage-scope` when files exist. It remaps shared control tokens to graphite in both themes; empty drop sheets remain on paper. The landing sample uses the same stage scope.

The compression viewport reserves a mat around fitted media. Registration marks, Original/Result labels, sizes and signed changes derive from the fitted image bounds and stay outside its pixels at fit zoom. When zoomed, marks hide and labels become corner chips. The checkerboard is visible through transparent pixels. UI labels and controls do not scale with the image.

The view bar selects Original, Result, split or two-up, followed by zoom and fullscreen. Comparison requires a result. Fullscreen retains its controls; mobile keeps back, previous/next, view and zoom actions reachable.

## Controls

- Primary buttons use amber with ink text. Default, danger and text buttons have explicit hover, disabled and keyboard-focus states. Pointer interaction leaves no keyboard focus frame.
- Non-format choices use the themed combobox, including the portaled, viewport-clamped popup. Keyboard search, arrows, Escape and Tab work; scrolling closes the popup when its trigger moves.
- Format uses a JPEG/WebP/PNG/AVIF radio rail with roving focus, arrow keys and Home/End. PNG disables quality and explains lossless output.
- Four visible preset recipes show their format and quality; matching includes their advanced options. Presets replace format, quality and advanced settings while retaining resize. Global scope has Reset.
- Numeric drafts apply on blur or Enter and cancel with Escape. Enter/Escape retain focus. Range/number pairs have equal heights in enabled and disabled states.
- Locked settings retain readable labels and dashed control lines. Reduced motion suppresses continuous animation.

## Compression workbench

Queue rows contain a thumbnail, filename, status, per-image Custom marker, source/result sizes, signed change and a remaining-size bar. Processing uses that bar for progress. Selected rows have an amber edge; download/remove actions sit in the name row.

The stage header shows the filename, dimensions, sizes, output format and previous/next navigation. The inspector offers global or per-image scope, presets, format, quality, resize and advanced options. Per-image settings are snapshots and survive later global changes.

The inspector footer reports source and output format, dimensions, size and savings, then Download this image. The batch ledger reports completed/total count, failures, export errors and totals over exportable results, with cancellation and Download results. Larger outputs are shown as increases, not savings.

## Motion Photo and Live Photo workbenches

Paired photo/video panes show captions, fitted media, optional notes and downloads. The photo strip follows the rendered picture's edges, shows actual output dimensions and provides fullscreen. The video dock follows the visible video's left/right and bottom edges; a narrow dock puts its timer on a separate row. Desktop aligns the paired strips and download rows. Resizing and reactivating a tool recompute the fitted size.

Unsupported video playback, including metadata with no decoded frame size, uses a still-image fallback and a note while keeping the download available. Hidden tools stop playback and timeline updates.

The player retries a load still waiting for metadata every three seconds, up to three times. Linux Playwright WebKit can delay the first preview after conversion; successful conversion alone does not establish immediate playback. Check decoded frames and audio separately.

Android lists extracted files and their sizes with the no-re-encoding note. iOS offers preset, source timing or 30 fps, JPEG quality and audio; completed-item settings are locked but readable. The batch ledger provides counts, New batch, process/extract or cancel, and Download results.

## Landing, language and assets

Home contains a title sheet, three indexed tool links and the labelled generated JPEG/WebP dune comparison. Try sample imports the actual JPEG into the compressor. On phones the links precede the sample. Home rows share column positions and symmetric 20 px desktop/tablet or 12 px mobile insets.

The language picker contains English, Simplified Chinese, Traditional Chinese, Japanese and Korean. Browser detection with English fallback applies until an explicit choice is saved under `picforge.language`. Theme follows the system until selected; unavailable storage must not break rendering.

IBM Plex Sans Variable and Plex Mono are self-hosted with Latin/Latin Extended coverage and platform CJK fallbacks. The four WOFF2 assets are precached. Their [OFL notice](../packages/app/public/licenses/IBM-Plex-OFL-1.1.txt) and component [credits](../packages/app/public/licenses/NOTICE.txt) accompany the app. See [brand assets](design/brand.md), [sample provenance](design/darkroom-ledger.md#sample-assets) and [README screenshot procedure](assets/readme/README.md).
