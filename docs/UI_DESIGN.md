# PicForge image workbench

Implemented visual baseline, 2026-09-09. The accepted direction and concept assets
are in [visual-direction.md](design/visual-direction.md); semantic values are in
[design-tokens.json](design/design-tokens.json). Concepts contain illustrative data.
The application renders real components and imported media.

## Entry and shared structure

The default entry and legacy `tool=home` open the compact Landing Page. Users
select one of three tools; explicit tool URLs still open their workspaces. The
brand returns home. Navigation updates browser history and keeps visited queues
mounted, including when returning home and using Back/Forward. See the latest
[optical interaction system](design/interaction-redesign.md).

`WorkbenchLayout` provides shared queue, viewer and inspector regions.
`Inspector`, `SwitchControl`, `SelectControl` and `ConfirmDialog` provide consistent
controls and focus behavior. `Header` contains tool navigation, language, theme
and a mobile preferences menu. `ProjectInfo` now has separate Landing and workbench
variants: the Landing footer stays expanded, centered and wraps naturally; tool
footers retain a compact About entry beside batch actions. `AboutDialog` presents
project and open-source information in-app, with optional complete license texts.

Desktop uses a 60px optical header with a 12px outer inset, 256px queue and 304px
inspector around a flexible neutral preview. Navigation, preview tabs and settings
scope share one moving glass selection thumb, without underline indicators. The
preview control dock refracts the image beneath it; source/result pixels and all
exported data remain unchanged. The inspector scrolls its settings independently
while keeping selected-result download visible. System fonts and all five locales
remain; numbers use tabular figures.

At 768–1100px, queue and selected preview alternate beside the inspector, and the
header uses a tool selector. At 767px and below, queue/preview alternate in a
scrollable single column, with the inspector following the preview. The preview
dock returns to normal document flow on phones. Footer space and 44px touch
controls remain. Landing is a separate responsive layout with an interactive
particle/photo scene and three tool choices, not a compressed copy of the editor.

Browser language is resolved from supported navigator preferences, with English
fallback. A manually selected language persists under `picforge.language`; choose
Browser language to resume automatic detection. URL overrides are transient and
the old `i18nextLng` cache is ignored. Regional Chinese and language variants map
to the five actual resource bundles.

## Tool behavior

- **Compression:** a flat queue, original/result/compare viewer, zoom/pan and
  previous/next navigation. The inspector exposes global or selected-image
  settings, format, quality, absolute/percentage resize, fit method, advanced
  options and presets. Custom settings remain complete snapshots; global edits
  do not overwrite them, and returning to global settings is explicit. Contain
  fields say maximum width/height. Existing automatic processing is retained.
- **Android:** the same queue and paired photo/video preview, with a read-only
  output inspector and individual JPG/MP4 downloads. Extraction preserves the
  source bytes and exposes no re-encoding controls.
- **iOS:** paired groups, JPG/video results and batch settings in the inspector.
  Existing settings locks, standalone photo/video support, cancellation, retry,
  individual downloads and ZIP export remain. The interface identifies basename
  pairing without claiming Apple identifier verification. Hidden tools pause video.

Empty, pending, processing, completed, stale, failed, cancelled, duplicate-pair
and playback-fallback states have explicit text. Compression exports require a
result matching current settings; stale previews show the original with notice.
Errors offer retry and expandable details. Destructive clearing uses a modal
confirmation with Tab containment, Escape cancellation and focus restoration.
Batch export and selected-file download occupy distinct stable positions.

## Reference fidelity and intentional adaptations

| Accepted direction                              | Implemented result and verification                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Quiet continuous header and three tools         | Shared header, underline selection; mobile uses a full-name selector                            |
| Flat left file list                             | Thumbnail rows with actual status/size, restrained selection and visible actions                |
| Large neutral central preview                   | Uncropped contain view, synchronized comparison, persistent zoom controls                       |
| Right output inspector                          | Shared field hierarchy and spacing; tool-specific controls reflect real capabilities            |
| Forest accent, white/gray and charcoal surfaces | Semantic light/dark colors with visible focus and readable disabled text                        |
| Stable bottom action bar                        | Real completed cohort, cancellation when running, actual file/ZIP download                      |
| Natural mobile reflow                           | Queue/preview navigation, full-width media and scrollable settings; no squeezed desktop columns |

The reference is a composition guide, not a literal pixel specification. Its
approximate side widths and enlarged text are replaced by the documented
256/304px columns and 14px controls. Secondary selections use pale backgrounds
and underlines instead of solid green. Existing percentage resize, presets and
two-up comparison remain accessible. File counts, dimensions and output sizes
come from real QA files and results; no concept values are hardcoded. Generated
QA photography and browser screenshots remain outside the repository.

## Verification, 2026-09-09

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (185 tests across 21 files), and
  `pnpm build` passed after implementation.
- `node scripts/ui-check.mjs` passed three interaction groups with 25 captures covering
  desktop, tablet and mobile layouts; five locales; loaded compression and
  motion states; settings scope, keyboard controls, modal focus and downloads.
  Set `PICFORGE_UI_GROUPS=entry` for Landing/language/footer/history checks,
  `layout,interaction` for the workbenches, and optionally
  `PICFORGE_UI_IMAGE`, `PICFORGE_UI_URL` or `PICFORGE_QA_OUTPUT`. Default fixtures
  are synthetic; this script does not convert HEIC/MOV or start the Apple engine.
- Additional focused Chromium checks verified WebP bytes, ZIP manifests,
  Android reconstruction of original bytes, generated JPEG/MP4 iOS cancellation
  and retry, setting locks, hidden-video pause, pairing errors and confirmed reset.
- Production static-image browser acceptance passed, including mobile JPEG
  export and offline reload. Real camera media was deliberately omitted because
  processing, codecs, workers and conversion arguments are unchanged.
- Final visual inspection compared the accepted reference against actual
  1536×1024 desktop, 1024×768 tablet and 390×844 mobile screenshots, including
  Android downloads, dark iOS, compression errors and mobile settings.

The in-app browser was used first for live interactions. Its mobile screenshots
were scaled incorrectly and its Blob download waiter timed out; existing
Playwright Chromium was used for reliable pixel captures and downloaded-byte
assertions. Mobile evidence is browser viewport/touch emulation, not physical
phone testing. Firefox and Playwright WebKit received targeted UI/fallback checks in the optical
revision; these do not qualify real Safari or rerun camera conversions.
Temporary evidence is under `/tmp/picforge-workbench-final`,
`/tmp/picforge-workbench-ui` and `/tmp/picforge-workbench-production`.

Performance baselines, workers, codec packages, engine policy, stores and motion
processing/encoder arguments are unchanged. Production still registers Compat;
this work makes no speedup claim or Vips-default expansion. Performance and
conversion changes require separate implementation and evidence. No release,
version/cache bump, commit, push or deployment is part of this visual pass.

## Optical revision validation

The final implementation passed lint, 185 tests in 21 files, typecheck and build.
The opt-in entry group passed 15 captures (five locales at 1440×718, 856×718 and
390×844), browser-language default, complete centered footer, About focus and
keyboard entry/history. The existing workbench groups passed 25 captures and
three interaction groups. Additional live checks verified real displacement
changes painted pixels, particle/pointer response, offscreen pause, reduced
motion/transparency, sticky download, dark appearance and retained queues.

Firefox and Playwright WebKit passed targeted home/footer, dialog close/focus and
tool-entry checks. WebKit's mouse-click focus behavior required explicitly
focusing modal triggers; this was fixed and rechecked. Their optical fallback
was retained. Production static-image export and offline reload/re-encode passed;
real camera samples were omitted. An actual interaction recording and final
screenshots are under `/tmp/picforge-v2-qa`; they are temporary QA evidence.
