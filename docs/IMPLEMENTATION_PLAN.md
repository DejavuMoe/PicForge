# PicForge Implementation Plan

> Last updated: 2026-06-30 | Version: 0.14.0

## Completed

- Monorepo setup with `app`, `codecs`, and `worker` packages.
- React 18 app shell with native CSS, responsive file list, preview workspace, toolbar, and status bar.
- Local image flow: add files, generate previews, auto-compress, compare, and export.
- WASM codec pipeline for MozJPEG, WebP, OxiPNG, and AVIF through `@jsquash/*`.
- WorkerPool scheduling for parallel encoding and retry/cancel safety.
- Complete global settings and per-image snapshot override model.
- Export manifest and ZIP filename collision handling.
- PWA files, service worker registration, icons, SEO metadata, and offline cache.
- Unit tests for stores, utilities, preview helpers, export manifest, processing guards, and worker pool.
- GitHub release preparation: license, issue templates, PR template, contribution guide, security policy, and updated docs.
- ESLint, Prettier, `.gitignore`, and root `pnpm typecheck` scripts.

## Next

- Add GitHub CI workflow when release automation is desired.
- Add virtualized file list for 100+ image batches.
- Add keyboard shortcuts for delete, navigation, preview mode, and reset.
- Preserve source folder structure during ZIP export.
- Add browser smoke tests for offline refresh and installability.

## Release Checklist

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Production preview smoke test on desktop and 390px mobile width.
