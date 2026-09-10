# PicForge identity

The current mark is a folded P: two broad plates separated by a diagonal cut, with a play triangle inside. It connects the product name with its image and motion tools. This replaces the former typeset P inside a red square; the accepted workbench and player styling are retained.

The [SVG master](../../packages/app/src/assets/logo.svg) has three filled paths on a 64-unit grid. The header imports this exact source; Vite can inline the small SVG. Color is vermilion `#c44832`. The export pack also includes charcoal and white variants. The dark sharing card uses the lighter vermilion `#ef6b4a` against graphite `#202322`.

## Assets

| Purpose | Files | Size |
| --- | --- | --- |
| Symbol | [Color SVG](../../packages/app/public/brand/logo.svg), [charcoal](../../packages/app/public/brand/logo-black.svg), [white](../../packages/app/public/brand/logo-white.svg), [PNG](../../packages/app/public/brand/logo-512.png) | Scalable / 512×512 PNG |
| Horizontal lockup | [Light-background SVG](../../packages/app/public/brand/logo-lockup.svg), [dark-background SVG](../../packages/app/public/brand/logo-lockup-white.svg), [PNG](../../packages/app/public/brand/logo-lockup.png) | 512×128 SVG / 1024×256 PNG |
| Favicon | SVG, ICO and 16/32/48 px PNGs in `packages/app/public/` | ICO contains all three raster sizes |
| Apple Web Clip | [apple-touch-icon.png](../../packages/app/public/apple-touch-icon.png) | 180×180 |
| PWA | `pwa-192.png`, `pwa-512.png` | 192×192 / 512×512, purpose `any` |
| Maskable PWA | [PNG](../../packages/app/public/pwa-maskable-512.png), [SVG](../../packages/app/public/pwa-icon.svg) | 512×512, purpose `maskable` |
| Open Graph | [PNG](../../packages/app/public/og-image.png), [vector source](social-card.svg) | 1200×630, light background |
| Twitter large-image card | [PNG](../../packages/app/public/twitter-card.png), [vector source](twitter-card.svg) | 1200×600, dark background |

The previous `/og-image.jpg` URL remains valid and contains the new Open Graph artwork. Share-card text is outlined Noto Sans, so the final SVG/PNG assets need no font download and retain their exact typography. The web interface keeps its existing system-font wordmark.

## Integration

- The static HTML head contains matching Open Graph image dimensions/MIME/alt text and a separate `summary_large_image` Twitter image. All social URLs are absolute HTTPS URLs on `picforge.de`.
- JSON-LD points to the new application icon and the existing repository. No Twitter account or creator handle is invented.
- SVG favicon uses a new revision query to refresh existing tab-icon caches, with PNG and multi-size ICO fallbacks. Apple has its own 180 px icon.
- The manifest separates ordinary icons from opaque maskable icons. The latter keep the mark inside the central safe circle, following the [Web App Manifest safe-zone definition](https://www.w3.org/TR/appmanifest/#icon-masks). The measured foreground radius is below 0.4 of the icon width; circle and squircle previews retain the entire mark.
- The service-worker shell list includes the linked icons and both share cards, including the revisioned favicon URL. Existing engine loading/caching behavior is unchanged.

The image properties follow the [Open Graph protocol](https://ogp.me/). The Apple link uses the [documented PNG Web Clip format](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html). Actual social-platform scraping and installed-device icon refresh require the new build to be deployed; local checks do not claim those external outcomes.

## Reproduction and provenance

Run `pnpm assets:brand` with Python 3, `rsvg-convert`, `pango-view`, ImageMagick and Noto Sans available. This is an explicit authoring command; normal app builds use the committed assets and do not require these export tools. It regenerates the icon family, lockups, outlined card SVGs, raster exports and [size/hash manifest](brand-assets.json) from the SVG master. Two consecutive exports were byte-identical in the authoring environment.

Four text-only directions were explored with built-in Codex ImageGen. [Exact prompts](brand-prompts.json) are recorded, and [the selected D reference](brand-concept.png) is kept for provenance. The reference is an illustrative raster concept. Its shading was removed, its geometry rebuilt as three paths, and spacing was adjusted for small icons. No personal photos were supplied to generation. The final source and exports are the actual integrated artwork.

## Validation

The asset preview checks 16, 32 and 48 px icons on light/dark surfaces and common install masks. `scripts/browser-check.mjs` verifies the built header mark, metadata URLs, decoded dimensions, manifest sizes, mask opacity/safe area and offline availability of linked brand assets alongside the production compressor/PWA smoke check. `PICFORGE_UI_GROUPS=entry` retains the five-locale desktop/mobile entry checks.

Lint, all project type checks, 190 tests in 22 files and the production build pass. Chromium 145.0.7632.6 passes 15 entry captures across five locales, plus production compression/download/mobile/offline checks. All 11 linked brand resource URLs load offline; the maskable PNG is fully opaque and its foreground radius measures 0.3765 or less. The in-app browser confirms the new header mark and final favicon/Open Graph/Twitter/Apple references.

Temporary evidence: `/tmp/picforge-brand-qa.png`, `/tmp/picforge-brand-ui`, `/tmp/picforge-brand-production` and `/tmp/picforge-brand-production.log`. Existing media-engine and real Safari qualification limits remain unchanged. No release or deployment is implied by this working-tree identity update.
