# Landing Page and restrained thin glass — superseded

**Superseded after user visual review.** Current requirements and implementation
are in [interaction-redesign.md](interaction-redesign.md). This file records the
rejected blur-only/row-layout iteration, not the current target.

Earlier decision, 2026-09-09: open a Landing Page first, then let users select
a tool. This supersedes the earlier direct-compression entry decision.

## Layout and interaction

The page uses one headline and sentence, followed by three equal-priority tool
links. The entire row is clickable; there is no extra start button or decorative
feature grid. Desktop content is 1040px maximum, with 104px rows, 48px headline
maximum, and 19/14px tool title/description. Mobile uses a 32px headline, 112px
minimum rows and 17/13px tool copy. Chinese headline parts wrap at the comma.
All five locales, system fonts, light/dark themes and bottom-left project links
are retained. Compact screens keep the upward About disclosure.

Default and `tool=home` render the Landing Page without mounting an image tool.
Explicit tool URLs still work. Tool entry links support native modified clicks;
ordinary navigation updates history. Home, Back and Forward retain visited queues.
Hidden workspaces preserve their existing active-tool clipboard/video rules.

## Material boundary

Reference: [Hyalite](https://github.com/VII-Cae/hyalite--liquid-glass), whose source
computes geometry-dependent maps in JavaScript for SVG backdrop displacement.
It documents Chromium-only SVG backdrop support and fallbacks elsewhere. Its
edge-refraction/clear-center principle informed this implementation; no Hyalite
code was copied or installed.

This is a CSS/SVG visual approximation, not physically computed refraction:

- CSS transparent tint, shallow blur/saturation and inset edge highlights.
- One static SVG gradient stroke per entry; no turbulence, displacement map,
  canvas, ResizeObserver, animation loop, chromatic dispersion or remote asset.
- Material appears on entry hover, keyboard focus or press. Each tool remains
  equally selectable. Text and icons are separate from the backdrop layer.
- Secondary About/Preferences popovers share thin-glass tokens. Image previews,
  file queues, settings and output pixels are never filtered.
- Reduced motion removes the 160ms opacity transition. Reduced transparency and
  forced colors disable blur and sheen; unsupported blur has an opaque fallback.

A white page naturally produces a subtle effect. Do not add colorful backgrounds
or large distortions merely to demonstrate glass. This scope adds no processing
engine, media or performance changes and makes no new speedup claim.

## Concept and implementation comparison

[Full-page concept](concepts/landing-thin-glass.png), generated with built-in
ImageGen. It is a design source, not an application asset or a webpage screenshot.

| Concept requirement               | Implementation                                                     |
| --------------------------------- | ------------------------------------------------------------------ |
| White page, restrained header     | White/charcoal themes, brand plus language/theme                   |
| One title and supporting sentence | Localized text with mobile punctuation-aware wrap                  |
| Three open horizontal rows        | Whole-row native links, consistent icon/title/description/arrow    |
| Glass on the active interaction   | CSS backdrop plus static SVG edge on hover/focus/press only        |
| Quiet footer                      | Existing ProjectInfo, inline desktop and upward compact disclosure |
| No fake media or statistics       | No raster asset is loaded by the application                       |

Intentional adaptations: system font metrics, inherited header controls and
footer icons remain consistent with the workbench; all three rows begin flat,
with the concept's first-row material appearing on actual interaction. Mobile
uses the existing preferences menu and natural page scrolling.

Generation brief: complete compact 1440×900 PicForge tool chooser; true white
background; left-aligned Chinese title “让每一张影像，恰到好处。” and one local-processing
sentence; three horizontal image/Android/iOS tool links; thin glass on the first
hovered row only; Feather icons; understated project footer; no photography,
metrics, badges, particles, bento grid or extra calls to action. All visible UI
must be code-native and practical to implement in CSS/SVG.

## Verification scope

Targeted Chromium checks cover four widths (1440/768/390/320), five languages,
keyboard entry, tool deep links, home/back/forward, retained synthetic image
queue, dark/forced-color views and absence of engine requests on initial home.
The in-app browser verified entry and return-home interactions first; its mobile
screenshots still scaled the content into a small area, so reliable pixel QA used
existing Playwright Chromium. This is viewport emulation, not real phone testing.
No real HEIC/MOV conversion or benchmark is required for this change.

Current checks passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`; 20 localized
responsive cases plus navigation/retention interactions; production static-image
export and offline reload/re-encode using the existing browser acceptance script.
No camera sample fixtures were provided or converted.
