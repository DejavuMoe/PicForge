# PicForge identity

The mark is a folded P: two broad plates separated by a diagonal cut, with a play triangle inside. The [SVG master](../../packages/app/src/assets/logo.svg) has three filled paths on a 64-unit grid: ink `#171714` plates and a safelight-amber `#f2b100` triangle. `pnpm assets:brand` derives the exports from this master.

The header, favicon and install icons use an ink tile with a paper `#f3f1ea` P and amber triangle. The same tile works on both themes. The export pack also provides one-colour ink/white marks and light/dark lockups.

## Assets

| Purpose | Files | Size |
| --- | --- | --- |
| Symbol | [Two-tone SVG](../../packages/app/public/brand/logo.svg), [on dark](../../packages/app/public/brand/logo-on-dark.svg), [ink](../../packages/app/public/brand/logo-black.svg), [white](../../packages/app/public/brand/logo-white.svg), [PNG](../../packages/app/public/brand/logo-512.png) | Scalable / 512×512 PNG |
| Header | [Tile SVG](../../packages/app/src/assets/logo-tile.svg), bundled and precached by Vite | 64×64 |
| Horizontal lockup | [Light SVG](../../packages/app/public/brand/logo-lockup.svg), [dark SVG](../../packages/app/public/brand/logo-lockup-white.svg), [PNG](../../packages/app/public/brand/logo-lockup.png) | 512×128 SVG / 1024×256 PNG |
| Favicon | SVG, ICO and 16/32/48 px PNGs in `packages/app/public/` | ICO contains all three raster sizes |
| Apple Web Clip | [PNG](../../packages/app/public/apple-touch-icon.png) | 180×180 |
| PWA | `pwa-192.png`, `pwa-512.png` | 192×192 / 512×512, purpose `any` |
| Maskable PWA | [PNG](../../packages/app/public/pwa-maskable-512.png), [SVG](../../packages/app/public/pwa-icon.svg) | 512×512, purpose `maskable` |
| Open Graph | [PNG](../../packages/app/public/og-image.png), [vector source](social-card.svg) | 1200×630, paper background |
| Twitter card | [PNG](../../packages/app/public/twitter-card.png), [vector source](twitter-card.svg) | 1200×600, dark background |

`/og-image.jpg` serves a JPEG copy of the Open Graph artwork. Lockup and card text uses outlined IBM Plex Sans 1.1.0, so the final artwork does not depend on a font download. Titles end in the amber square used on the landing page.

## Integration contract

- Static HTML includes matching Open Graph dimensions, MIME type and alt text, plus the separate Twitter `summary_large_image` card. Social image URLs are absolute HTTPS URLs on `picforge.de`; JSON-LD refers to the app icon and repository.
- SVG favicon uses `?v=ledger`, with PNG/ICO fallbacks and a separate 180 px Apple icon. Keep revision URLs consistent with the service-worker shell list when editing assets.
- The manifest separates ordinary icons from opaque maskable icons. Keep the mark inside the central safe circle with radius 40% of the image width; verify circle and squircle crops.
- The service-worker shell includes the linked icons and both share cards. Normal builds consume committed assets.

## Authoring and checks

Run `pnpm assets:brand` with Python 3, `rsvg-convert` (`librsvg2-bin`), `pango-view` (`pango1.0-tools`), ImageMagick and IBM Plex Sans Regular/Medium/SemiBold installed as OTF/TTF. Pango can silently substitute a font when supplied WOFF files; if necessary, use fontTools to convert `@ibm/plex-sans@1.1.0` `fonts/complete/woff` files. These are explicit authoring dependencies, not application build dependencies.

The command regenerates icons, lockups, outlined card SVGs, raster exports and the [size/hash manifest](brand-assets.json). Check two consecutive exports for byte equality, inspect 16/32/48 px icons on light/dark surfaces and install masks, then run the relevant checks in the [validation guide](../validation.md).

`scripts/browser-check.mjs` checks header/metadata resources, decoded dimensions, manifest sizes, mask opacity/safe area and offline asset loading. `PICFORGE_UI_GROUPS=entry` covers five-locale desktop/mobile entry behavior. Deployed social previews and installed-device refresh require checks on those actual services/devices.

The mark is a vector drawing informed by a generated raster reference from OpenAI ImageGen. No personal photographs were supplied. The three-path SVG master and generated exports are the integrated artwork. IBM Plex retains its [SIL OFL notice](../../packages/app/public/licenses/IBM-Plex-OFL-1.1.txt); preserve the application's [component credits](../../packages/app/public/licenses/NOTICE.txt).
