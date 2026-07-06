# PicForge

[![MIT License](https://img.shields.io/badge/license-MIT-111111?labelColor=ffffff)](LICENSE)
![React](https://img.shields.io/badge/React-18-111111?labelColor=ffffff)
![Vite](https://img.shields.io/badge/Vite-5-111111?labelColor=ffffff)
![Local first](https://img.shields.io/badge/local--first-no_uploads-111111?labelColor=ffffff)

**Language:** English | [简体中文](docs/readme/README.zh-CN.md) | [繁體中文](docs/readme/README.zh-TW.md) | [日本語](docs/readme/README.ja.md) | [한국어](docs/readme/README.ko.md)

**Demo:** [picforge.de](https://picforge.de)

PicForge is a local-first browser app for batch image compression and resizing. It uses Canvas, Web Workers, and WebAssembly codecs to process images on your device. There are no accounts, uploads, or server-side image processing.

![PicForge workspace preview](docs/assets/picforge-preview.svg)

## Highlights

| Feature             | Details                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| Local processing    | Decode, resize, encode, preview, and export run in the browser.         |
| Batch workflow      | Add images by click, drag-and-drop, folder drop, or paste.              |
| Compression formats | MozJPEG, WebP, OxiPNG, and AVIF via `@jsquash/*`.                       |
| Worker pipeline     | Browser-side decode/resize with WASM encoding in a managed WorkerPool.  |
| Per-image overrides | Global settings can be overridden by a complete snapshot on any image.  |
| Preview modes       | Slider, side-by-side, and single-image comparison with zoom and pan.    |
| Export tracking     | Single download or ZIP export with `picforge-manifest.json`.            |
| PWA ready           | Installable app shell with offline cache and foreground update prompt.  |
| Internationalized   | English, Simplified Chinese, Traditional Chinese, Japanese, and Korean. |

## Quick Start

Requirements:

- Node.js 18 or newer
- pnpm 8 or newer

```bash
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

Production build:

```bash
pnpm build
pnpm preview
```

## Architecture

```text
User files
  -> fileStore queue
  -> effective settings: global or per-image snapshot
  -> decode and optional resize with browser Canvas APIs
  -> WorkerPool encodes pixels with @jsquash WASM codecs
  -> preview URLs, size stats, manifest metadata, and export actions
```

The UI is a native React app shell with dense workspace controls: header, toolbar, file list, preview, single-image settings, and status bar. Preview overlays are separated from the image transform layer so labels and metadata do not scale during zoom.

## Commands

| Command          | Action                                       |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Start the app dev server on `127.0.0.1`.     |
| `pnpm build`     | Build the production app.                    |
| `pnpm preview`   | Preview the production build.                |
| `pnpm lint`      | Run ESLint.                                  |
| `pnpm test`      | Run Vitest.                                  |
| `pnpm typecheck` | Type-check app, worker, and codecs packages. |

## Documentation

| Document                             | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| [Architecture](docs/ARCHITECTURE.md) | Runtime architecture and data flow.        |
| [QA checklist](docs/QA_CHECKLIST.md) | Manual regression and release checks.      |
| [i18n guide](docs/I18N.md)           | Translation and language support notes.    |
| [Changelog](docs/CHANGELOG.md)       | Version history.                           |
| [Contributing](CONTRIBUTING.md)      | Development and pull request guidance.     |
| [Security](SECURITY.md)              | Vulnerability reporting and privacy model. |

## Privacy

PicForge reads selected files locally and uses generated object URLs for preview and export. Object URLs are revoked when files or results are removed. If you deploy the app yourself, keep analytics, upload flows, and remote processing out of the default path unless users explicitly opt in.

## License

[MIT](LICENSE) © [DejavuMoe](https://github.com/DejavuMoe)
