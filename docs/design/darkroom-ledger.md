# PicForge: darkroom ledger

Status: current visual specification, 2026-09-26. It replaces the [editorial workbench brief](editorial-redesign.md) (2026-09-09) and every earlier concept. Those documents remain historical records. Implementation and QA evidence: [UI_DESIGN.md](../UI_DESIGN.md). Tokens: [design-tokens.json](design-tokens.json).

## Why a new visual

A browser audit of the previous build (desktop, 390 px phone, dark and Simplified Chinese; every tool, empty and completed) found a competent but anonymous interface:

- The three-pane layout used generic SaaS chrome. A tool heading band repeated the navigation and cost 58 px on every tool.
- The 240 px queue wrapped `144.5 KB →` / `84.6 KB` onto two lines. The file rows carried no visual measure of the result.
- On phones, the list view left about 850 px empty with one file. Settings could only be reached through the preview.
- Locked Live Photo settings were greyed out so far that they were hard to read.
- The preview put dark labels on top of the pixels being judged. There were separate original/result/compare tabs and compare-mode buttons.
- When a browser parsed a video's metadata but could not decode it (for example HEVC Motion Photos), the dock took the width of the poster box. It was then wider than the visible still.

The redesign treats PicForge as what it is: a precise local instrument for judging and exporting pixels. Its references are the darkroom (safelight amber, a neutral viewing stage, registration marks) and the lab ledger (ruled rows, indexed entries, set-in-mono figures).

## Principles

1. **Pixels are judged on graphite.** Media always sits on a hue-free graphite stage, in both themes, so warm chrome cannot bias colour judgement. Nothing is drawn over the image at fit zoom. Labels, marks and sizes sit in the mat around it.
2. **One signal.** Safelight amber means "act here" or "this is the current one": the primary action, the current tool and row, the checked switch, range fill, progress, the done marker and the terminal square. It is never decoration. Text on paper uses the darker `signal-ink` to meet contrast.
3. **Measure, don't decorate.** Every figure is real: file sizes, dimensions, the saved share and batch totals. Numbers are set in Plex Mono with tabular figures. The size bar in each row shows remaining size as a share of the original; the empty part of the rule is what was saved.
4. **Ruled, not boxed.** Panes are separated by 1 px hairlines. There are no cards, drop shadows or pills. Controls have 2 px corners. Only overlays (menus, dialogs, toasts) are raised.
5. **Quiet motion.** Transitions of 120–160 ms apply to colour and position only. There are no loops, particles, glass, gradients or cursor effects. Reduced motion collapses them.

## Anti-slop rules

Do not add: purple/blue gradients, glassmorphism, glowing borders, soft 12–24 px radii, stacked shadows, emoji, sparkles, gradient text, decorative blobs, stock 3D art, "AI" badges or marketing superlatives. Do not invent values: no illustrative sizes, counts or speedups. Do not add a second accent colour. Do not tint, filter or overlay the pixels being evaluated.

## System

### Colour

| Role | Light "Paper" | Dark "Darkroom" |
| --- | --- | --- |
| Paper (chrome) | `#f3f1ea` | `#161614` |
| Raised (controls, menus) | `#fbfaf6` | `#1e1e1b` |
| Sunk (hover, selected row) | `#e9e6dd` | `#262622` |
| Ink / 2 / 3 | `#171714` / `#504e48` / `#69665d` | `#eeebe3` / `#b3afa5` / `#959186` |
| Hairline / strong / control line | `#dbd7cc` / `#c4bfb1` / `#8b867a` | `#2b2b27` / `#3c3b36` / `#6c6960` |
| Signal fill / signal text | `#f2b100` / `#7a5300` | `#f5b400` / `#f5b400` |
| Alert | `#b3261e` | `#ff8e7f` |
| Stage | `#2a2a29` | `#0f0f0f` |

`.pf-stage-scope` remaps the paper/ink tokens to the stage values. Shared controls (the view switch, zoom select and video dock) therefore render correctly on graphite without their own variants. The empty drop sheet stays on paper, and the stage takes over once media exists. The landing sample uses the same scope.

Contrast: ink-3 is at least 4.5:1 on paper in both themes, and control lines are at least 3:1. Keyboard focus is a 2 px ink outline on paper (amber in dark mode and on the stage). The outline is offset 2 px, so it never depends on the amber fill.

### Type

- Latin: IBM Plex Sans Variable (100–700). Figures and codes use IBM Plex Mono 400/500. Both are self-hosted WOFF2 files, Latin and Latin Extended only, SIL OFL 1.1. They are precached with the shell.
- CJK falls through to the platform face: PingFang, Hiragino, Microsoft YaHei/JhengHei, Yu Gothic, Malgun Gothic, then Noto CJK. Letter-spaced capitals are a Latin-only device; CJK labels keep natural spacing.
- Scale: 11 px mono labels · 12 px supporting · 13 px controls and rows · 14 px body · 16 px wordmark · 22 px tool index · 44–80 px landing title (weight 500, −0.035 em). The title ends in a small signal square.
- Column headers (`FILES`, `OUTPUT SETTINGS`) are 12 px semibold capitals with 0.06 em tracking. They are used sparingly, as ledger captions.

### Geometry

2 px radius; 1 px rules. Controls are 32 px on desktop and 44 px on phones and coarse pointers. The header is 52/56 px and the status line 32 px. Desktop columns: 288 px queue, flexible stage, 312 px inspector. Tablet (768–1100 px): 288 px inspector, with queue and stage sharing one column. Phone: one scrolling column with a sticky batch ledger.

### Motifs

- **Registration marks.** L-shaped 1 px corners frame the fitted image. They sit 8 px outside it and derive from the same constraints as the image, using container units and the known intrinsic size, so they never cover pixels. The empty drop sheet uses larger marks around the whole stage; they turn amber and move inwards while a file is dragged over.
- **Index numbers.** The tools are always 01 Compression, 02 Motion Photo and 03 Live Photo: in the header, the landing index and the empty-state eyebrow.
- **Size bar.** A 2 px rule under each finished row and in the inspector ledger shows remaining size. Processing uses the same slot for amber progress.
- **Signal square.** A 6 px amber square marks "done" and the local-processing status. A proportional square ends the landing and social-card titles.

## Layout

**Header.** Folded-P tile, wordmark, indexed tool navigation (an amber rule marks the current tool), GitHub, language and theme. On phones: tile, tool picker, GitHub and a preferences menu.

**Queue (left).** Ledger rows, each with a 44 px thumbnail, name, status with done marker, `source → result` in mono, a signed change and the size bar. Download/remove actions sit in the name row; the selected row has an amber edge. The **batch ledger** sits under the queue: count, batch totals, cancel/new batch and the primary action. On phones it is sticky at the bottom.

**Stage (centre).** A file header with name, facts and pagination. The plate has marks and labels outside it: `ORIGINAL 144.5 KB`, `RESULT 59.7 KB −59%`. The **view bar** has one switch (Original · Result · split · two-up), zoom and full screen. At zoom above fit, marks hide and the labels become small chips in the corners, the only time anything overlaps the image.

**Inspector (right).** Scope (all images / this image), then four presets as labelled recipes (`Web Photo / JPEG · Quality 80`); the recipe matching the current settings is marked. Next come the format as a radio rail, quality, resize and advanced options as ruled rows. The pinned footer is a ledger with source format, dimensions and size; result format, dimensions and size; the size bar with the saved share; and the download.

**Media tools.** A paired photo and video sit on the stage, each followed by a dock fitted to the visible media. Disabled (locked) settings stay legible: dashed control lines and ink-3 labels. When the video cannot be decoded, the still is shown with a note and the download remains available.

**Landing.** Title with signal square, summary, local-processing line. On the right, the real sample comparison on a graphite plate with registration marks and JPEG/WebP labels. The dune sample is a generated, non-personal image; its provenance is recorded in the [editorial brief](editorial-redesign.md#asset-provenance-and-final-adaptations). Below, the ruled tool index behind a heavy ink top rule. On phones the index precedes the sample and fits the first 844 px.

**Status line.** Copyright, `■ Local processing · v0.17.0` and sponsorship. On phones: copyright above sponsorship, both centred. There is no About entry or raw licence link.

## Brand

The folded P geometry is unchanged. The master now paints the body ink and the play triangle signal amber. The app icon, favicon and in-app header mark are the same tile: ink square, paper P, amber triangle. It reads on both themes without a theme-specific asset. Share cards use outlined IBM Plex Sans with the signal square. See [brand.md](brand.md).

## Engineering boundaries

Class names, test ids, CSS custom properties read by JavaScript (`--pf-video-*`, `--pf-photo-*`, `--pf-source-*`, `--pf-result-*`, `--pf-range-fraction`) and the workbench data attributes are preserved. Media processing, worker, cache and CSP behaviour is unchanged except for adding WOFF2 fonts to the precache manifest and site verifier. The only runtime logic changes are:

- the unified view switch;
- the batch totals;
- preset matching;
- the format radio rail with roving focus;
- the video fallback when the frame size is zero after metadata loads.
