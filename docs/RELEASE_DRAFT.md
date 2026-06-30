# PicForge 0.14.0 Release Draft

## Positioning

PicForge is a local-first browser tool for batch image compression. It helps users resize, compare, and export images without uploading files to a server.

Demo: [picforge.de](https://picforge.de)

## Highlights

- Native React app shell for the full main workflow: toolbar, file list, preview, per-image settings, and status bar.
- Local WASM compression for MozJPEG, WebP, OxiPNG, and AVIF.
- Complete per-image settings snapshots with clear custom/global state.
- Slider, side-by-side, and single-image preview modes with zoom and pan.
- ZIP export with `picforge-manifest.json` for traceable output parameters.
- PWA manifest, install icons, service worker, SEO metadata, and offline refresh after first load.
- Five app locales plus localized README documentation.
- GitHub-ready project metadata, MIT license, issue templates, PR template, contribution guide, and security policy.

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Production browser smoke test: empty state, image paste/add, compression, preview modes, per-image settings, restore global, export controls, 390px mobile layout, console without warnings or errors.

## Known Limits

- CI workflow is not included yet; run the verification commands locally before release.
- Very large AVIF batches may be slow depending on browser WASM performance.
- The repository is distributed as an app, not as npm packages.

## Privacy Note

PicForge processes images in the browser. The app does not require accounts, uploads, remote image processing, or analytics to perform compression.
