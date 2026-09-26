# Darkroom ledger design system

PicForge uses warm paper and ink for application chrome, one safelight-amber signal, and a hue-free graphite stage for judging media. [UI_DESIGN.md](../UI_DESIGN.md) describes the implemented layouts and controls. The source of truth for values is [tokens.css](../../packages/app/src/styles/tokens.css), with a portable [token file](design-tokens.json).

## Principles

- Keep media on graphite in both themes. At fit zoom, labels, registration marks and measurements belong in the mat outside the pixels. Never tint or filter media.
- Reserve amber for actions and state: primary actions, current tool/row, checked switches, range fill, progress, completion and local-processing markers. Use `signal-ink` for text on paper.
- Show actual sizes, dimensions, percentages and times in Plex Mono. Size bars express remaining bytes relative to the source. Generated examples are labelled and are not benchmarks.
- Separate panes and rows with 1 px rules; use 2 px corners. Raise only overlays such as menus, dialogs and toasts. Keep one accent; avoid gradients, glass, glows, decorative particles, emoji and soft cards.
- Keep transitions short and honour reduced motion. Preserve accessible contrast, keyboard focus and readable disabled states.

## Colour

| Role | Light | Dark |
| --- | --- | --- |
| Paper | `#f3f1ea` | `#161614` |
| Raised / sunk | `#fbfaf6` / `#e9e6dd` | `#1e1e1b` / `#262622` |
| Ink / secondary / supporting | `#171714` / `#504e48` / `#69665d` | `#eeebe3` / `#b3afa5` / `#959186` |
| Rule / strong / control line | `#dbd7cc` / `#c4bfb1` / `#8b867a` | `#2b2b27` / `#3c3b36` / `#6c6960` |
| Signal fill / text | `#f2b100` / `#7a5300` | `#f5b400` / `#f5b400` |
| Alert | `#b3261e` | `#ff8e7f` |
| Stage | `#2a2a29` | `#0f0f0f` |

`.pf-stage-scope` remaps shared surface, ink, rule and focus tokens so view controls, zoom and playback docks use the stage palette. The empty drop sheet stays on paper. Keyboard focus uses a 2 px outline offset by 2 px: ink on paper, amber in the dark theme and on the stage.

## Typography and geometry

IBM Plex Sans Variable supplies Latin text; Plex Mono 400/500 supplies numbers and codes. The self-hosted WOFF2 files carry SIL OFL 1.1. CJK uses platform fonts through locale-specific fallback stacks; letter-spaced capitals apply only to Latin labels.

The type scale uses 11 px mono labels, 12 px supporting text, 13 px controls/rows, 14 px body, 16 px wordmark, 22 px tool links and a responsive landing title. Controls are 32 px on desktop and at least 44 px on phones/coarse pointers. Header height is 52 px desktop and 56 px phone; the desktop footer is 32 px.

Desktop columns are 288 px queue, flexible stage and 312 px inspector. Tablet shares queue/stage space beside a 288 px inspector. Phones use one scrolling column with sticky batch actions. Home rows share one column template with 20 px desktop/tablet and 12 px mobile insets.

Registration marks follow the fitted image bounds. They hide above fit zoom. Tool indexes are 01 Compression, 02 Motion Photo and 03 Live Photo. A 2 px size bar shows remaining size; processing reuses that slot for progress. A small amber square marks completion and local processing and ends the landing/social titles.

## Brand

The [folded-P identity](brand.md) uses an ink body and amber play triangle. The header, favicon and app icons share an ink tile with a paper P. Share cards use outlined IBM Plex Sans. Derive exports from the SVG master instead of creating independent marks.

## Sample assets

The dune image is an OpenAI ImageGen-generated, non-personal example: a 3:2 landscape with golden dune ridges and fine sand texture, hazy blue sky and distant mountains, with no people, typography, logos or watermarks. No private camera media was supplied for its generation.

The generated image was resized and encoded with ImageMagick; both assets have stripped metadata:

| Asset | Dimensions | Encoding | Bytes |
| --- | --- | --- | --- |
| [dune-sample.jpg](../../packages/app/src/assets/dune-sample.jpg) | 1200 × 800 | JPEG quality 85 | 147,972 |
| [dune-preview.webp](../../packages/app/src/assets/dune-preview.webp) | 1200 × 800 | WebP quality 68 | 55,092 |

The home slider compares these prepared assets. Try sample imports the JPEG into the production Compat engine and reports its actual output. The [README screenshots](../assets/readme/README.md) use this image and temporary synthesized media; camera fixtures are never published as demonstration assets.
