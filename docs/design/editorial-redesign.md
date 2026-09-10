# PicForge: a quieter image workbench

> The later controls/copy review supersedes this brief’s native-select, automatic-option, slogan and footer details. See [the current UI specification](../UI_DESIGN.md). The original concept and asset provenance below remain historical records.

Status: implementation brief, 2026-09-09. The current user request supersedes the green optical prototypes and the previous particle/glass requirements. Historical design and media-validation reports remain evidence of their respective revisions, not the specification for this redesign.

## Product decisions

The product has three jobs: reduce an image's file size/dimensions, extract an Android Motion Photo without re-encoding, and convert iOS originals into shareable derivatives. Give each job a direct entry, accurate format guidance and a consistent files → preview → settings → download path. Do not imply Apple identifier verification, lossless iOS archival, unconditional offline readiness or universal video playback.

The landing page introduces these jobs with three flat, ordered links and one interactive, explicitly labelled sample comparison. The example uses a generated non-personal dune photograph and a pre-encoded derivative. No example file sizes are presented as application benchmarks. No particle loop, cursor halo, refraction or decorative engine is necessary.

The desktop workbench uses a 240px file rail, flexible neutral image mat and 300px settings inspector. A compact task heading explains the selected operation. Preview tools belong below the image so they cannot obscure pixels. Keep global/custom settings provenance, original/result/compare views, independent queues, cancellation and retry.

Below 1100px the file list and preview share a pane with an explicit return action. Below 768px settings follow the preview in the same scroll area; batch actions remain visible outside it. Controls on touch layouts have at least 44px targets. All five languages and both themes share geometry.

## Design system

- Surfaces: white `#ffffff`, neutral shell `#f5f5f4`, image mat `#e9e9e7`; dark equivalents `#202020`, `#181818`, `#141414`. No tint or filter on image pixels.
- Ink: `#222221`, secondary `#636360`; dark ink `#f2f2f0`, secondary `#b5b5b1`.
- Accent: warm vermilion `#b8422d` for accessible small text; primary fill `#c44832` with white text. Dark accent `#f08b76`. Selection surfaces remain neutral; the accent only identifies actions and selection edges.
- Type: local system sans, 14px body / 12px supporting information / 16–20px workbench headings. Landing title 40–68px, normal linguistic line breaks. System monospace only for format notation and ordered tool indexes.
- Spacing: 4, 8, 12, 16, 24, 32, 48px. Control radius 4–6px; pane boundaries are flat. Use shadow only where an overlay needs separation.
- Icons: existing Feather family; a code-native square P brand mark. Remove shaded platform-brand icon treatment.
- Controls: native select and dialog, explicit focus outlines, CSS selected states, short color transitions; reduced-motion and forced-colors support.

## Engineering boundaries

Retain Compat as production engine, existing media guards, output semantics, worker cancellation, source Blob retry ownership and self-hosted lazy codec loading. No dependency upgrade or unqualified Vips switch. Remove visual-only runtime work and defer compression UI loading until selected. Retain successfully visited workspaces so navigation never discards a queue.

Verify production asset loading and offline behavior after changing lazy entry points; verify desktop/mobile interactions, focus, all languages and themes. Check the actual browser render against the generated full-page, workspace and mobile references. Report measured bundle differences against the same source host, separately from historical codec performance evidence.

## Asset provenance and final adaptations

Concepts were generated with the built-in ImageGen tool before implementation: a complete desktop compression workspace, a complete Landing page, and mobile file-list/preview states. They specify neutral white/graphite surfaces, restrained vermilion, flat panes, native-size controls and an image-led layout. Illustrative counts, sizes and photographs in those concepts were not copied into the application's state or benchmark documentation.

The final UI keeps the concept's structure while using the actual tool names, real output values, existing percentage/advanced settings, platform-native selects, and a useful sample-import action. Mobile tool links precede the image so navigation is visible without scrolling. Previous/next controls sit beside the filename, leaving room for 44px zoom/compare targets at 320px. Copyright, GitHub and sponsorship follow the existing product requirements.

The standalone sample was generated through the built-in ImageGen tool with this prompt:

> Use case photorealistic-natural. Asset type: standalone local demo photograph for PicForge open-source image compression app. A beautiful quiet editorial landscape photograph of sculptural golden sand dunes, strong curving ridge rising across right half, delicate ripples across foreground, pale hazy blue sky in top third, distant very muted rocky mountains on horizon. Late-afternoon natural directional sunlight, restrained warm gold and umber shadows, subtle real texture. Sophisticated travel photography, atmospheric, believable, no overprocessed saturation. Landscape aspect 3:2 1536x1024. Entire image is photographic content, no UI, no borders, no typography, no logo, no watermarks, no people, no identifiable private locations. Must have fine natural texture suitable for demonstrating image compression; represent a synthetic example not private user media.

The result was resized/encoded with ImageMagick to `packages/app/src/assets/dune-sample.jpg` (1200×800, JPEG quality 85, stripped metadata, 147,972 bytes). The comparison derivative is `packages/app/src/assets/dune-preview.webp` (same dimensions, WebP quality 68, stripped metadata, 55,092 bytes). This offline-prepared comparison is an example, not a live performance measurement. The Try this image action imports the JPEG into the production Compat path and displays actual resulting bytes.

The current [folded P identity](brand.md) supersedes the original typeset P tile. Its favicon, install icons and sharing cards use the same vector master. The brand guide records the ImageGen exploration, final vector refinement, deterministic raster exports and exact prompts. No private camera sample was used in an external service. The final implementation and verification record is [UI_DESIGN.md](../UI_DESIGN.md).

Install icons are rendered from the SVG at its 512px intrinsic size before creating the 192px variant, then written as stripped 8-bit PNGs (1,107 and 2,191 bytes). This avoids enlarging a 32px raster and keeps the installed icon sharp without a large download.
