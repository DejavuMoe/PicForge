<h1 align="center">PicForge</h1>

<p align="center">
  <strong>High-performance, privacy-first image and motion media toolbox powered by WebAssembly.</strong><br>
  100% in-browser processing. Zero uploads. Zero telemetry. Zero server dependencies.
</p>

<p align="center">
  <a href="https://picforge.de"><strong>Live Demo: picforge.de</strong></a>
</p>

<p align="center">
  <strong>Language:</strong> English | <a href="docs/readme/README.zh-CN.md">简体中文</a> | <a href="docs/readme/README.zh-TW.md">繁體中文</a> | <a href="docs/readme/README.ja.md">日本語</a> | <a href="docs/readme/README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.15.0-blue.svg" alt="Version 0.15.0" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License MIT" />
  <img src="https://img.shields.io/badge/react-18-blue.svg" alt="React 18" />
  <img src="https://img.shields.io/badge/typescript-5-blue.svg" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/vite-5-646CFF.svg" alt="Vite 5" />
  <img src="https://img.shields.io/badge/pwa-offline_ready-orange.svg" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/tests-128%20passed-brightgreen.svg" alt="Tests" />
</p>

---

## Overview

**PicForge** is an open-source, local-first browser toolbox engineered for high-throughput image compression, dynamic motion photo extraction, and cross-platform live photo transcoding. 

Unlike conventional cloud-based converters, PicForge executes all operations client-side inside Web Workers and WebAssembly runtimes. Your photos and videos never leave your local device.

<p align="center">
  <img src="docs/assets/picforge-workspace.jpg" alt="PicForge Workspace" width="100%" />
</p>

---

## Core Capabilities

### ⚡ 1. Batch Image Compression
* **WASM Codec Suite**: Leverages `@jsquash/*` compiled WebAssembly codecs:
  * **MozJPEG**: Advanced perceptual quantization and progressive scan optimization.
  * **WebP**: Lossy and lossless modes with SIMD acceleration detection.
  * **OxiPNG**: Lossless multi-pass PNG optimization.
  * **AVIF**: Next-gen compression with full quality mapping (0–100) and chroma subsampling control (`4:4:4` vs `4:2:0`).
* **Flexible Dimension Resizing**: Three resize modes with aspect-ratio locking:
  * `contain`: Proportional downscaling without enlargement.
  * `cover`: Centered smart crop to exact target geometry.
  * `stretch`: Explicit dimensional stretching.
* **Granular Settings Architecture**: Global presets paired with independent per-image snapshot overrides that survive global parameter changes.
* **Visual Quality Inspection**:
  * Real-time split comparison slider with sub-pixel viewport-layer clipping.
  * Side-by-side and single-view modes with 2× pan and zoom inspection.
* **Concurrency & Safety**:
  * Orchestrated multi-worker pool with concurrency bounds.
  * Robust task cancellation via `AbortController` and `taskEpoch` stale-callback guards.
  * Path-traversal-sanitized ZIP export with complete JSON metadata manifest.

### 📱 2. Android Motion Photo Extractor
* **Binary Extraction Engine**: Inspects JPEG binary structures to locate embedded MP4 video micro-streams directly.
* **Lossless Byte Preservation**: Extracts original JPEG stills and appended MP4 video clips without decoding or re-encoding.
* **Instant Processing**: Bypasses heavy encoding pipelines, running at native disk I/O throughput.
* **Batch Extraction**: Batch drag-and-drop with progress reporting and structured ZIP packaging.

### 🍏 3. iOS Live Photo Converter
* **Heuristic Basename Pairing**: Pairs unmodified `.HEIC` photos with corresponding `.MOV` video clips across case-insensitive filenames and nested directories.
* **QuickTime Clean Aperture (`clap`) Adapter**: Parses QuickTime atom trees to accurately compute clean-aperture display dimensions, preventing distorted margins or raster seams during autorotated export.
* **Client-Side Transcoding**:
  * **HEIC → MozJPEG**: Decodes high-efficiency HEIF bitstreams via `libheif-js` and compresses to optimized JPEG.
  * **MOV → H.264 / AAC**: In-browser single-threaded FFmpeg WASM transcode, generating standardized, universal web MP4s.
* **Frame-Accurate PTS Preservation**: Retains source presentation timestamps (PTS) by default, eliminating frame duplication artifacts, with optional 30 fps normalization.
* **Curated Transcoding Presets**:
  * **Balanced**: CRF 23, long edge ≤ 1920px, MozJPEG Q85 (Recommended).
  * **Quality**: CRF 20, long edge ≤ 1920px, MozJPEG Q90.
  * **Compact**: CRF 26, long edge ≤ 1280px, MozJPEG Q75.
* **Cross-Browser Playback Fallback**: Automatically provides static image previews and download notifications on platforms where browser engines cannot natively play specific video profiles.

---

## Architectural Principles

* **100% Zero-Upload Privacy**: No telemetry, analytics, cookies, or remote server uploads. All computations occur within local browser memory.
* **Lazy Engine Initialization**: Heavy WebAssembly binaries (FFmpeg, libheif) are lazy-loaded strictly upon accessing their corresponding tools.
* **Full Offline PWA Capability**: Built-in Service Worker with automated build-time precaching (`precache.json`). The application functions entirely offline once loaded.
* **Memory-Conscious Design**: Explicit cleanup of Object URLs and ArrayBuffers prevents memory exhaustion during large batch processing.
* **Universal Localization**: Built-in `i18next` engine supporting 5 languages:
  * English (`en`)
  * 简体中文 (`zh-CN`)
  * 繁體中文 (`zh-TW`)
  * 日本語 (`ja`)
  * 한국어 (`ko`)
* **Modern Adaptive UI**: Responsive glassmorphism interface featuring Geist typography, canvas-based particle field effects, confetti celebrations, and light/dark theme synchronization.

---

## Performance & Acceptance Benchmarks

Verified production-build metrics on official acceptance fixtures (Chromium / Linux x86_64):

| Media Stream | Source Input | Exported Output | Dimensions | Space Reduction | Fidelity (SSIM) |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **iOS Photo** | 2.33 MB HEIC | 2.01 MB MozJPEG (Q85) | 4284 × 5712 | **-13.8%** | **0.9898** |
| **iOS Video** | 2.89 MB MOV | 0.94 MB H.264 MP4 | 1308 × 1744 | **-67.4%** | **0.9821** |
| **Android Motion** | 9.35 MB JPG | Byte-identical JPG + MP4 | Source | Lossless | **1.0000** |

*Details, PTS analysis, and cross-browser regression data are documented in [docs/SAMPLE_VALIDATION.md](docs/SAMPLE_VALIDATION.md).*

---

## Monorepo Architecture

PicForge is structured as a modular TypeScript monorepo managed with `pnpm`:

```text
PicForge/
├── docs/                       # QA checklist, benchmarks, and project specifications
├── packages/
│   ├── app/                    # React 18 + Vite client, Zustand stores, UI shell & motion engine
│   │   ├── public/             # PWA manifest, service worker, fonts, and vendored WASM binaries
│   │   └── src/
│   │       ├── components/     # UI widgets (DropZone, Preview, FileList, Settings, Toolbar)
│   │       ├── hooks/          # autoCompressController and worker pool orchestration
│   │       ├── landing/        # Interactive particle canvas and product landing page
│   │       ├── motion/         # Clean-aperture parser, HEIC/FFmpeg pipelines, MotionWorkspace
│   │       └── stores/         # Zustand fileStore and settingsStore
│   ├── codecs/                 # Codec definitions, settings schema, and WASM loaders
│   └── worker/                 # Web Worker execution pool, decode/resize, and AVIF/WebP encoders
├── sample/                     # Acceptance test fixtures for Android and iOS formats
└── scripts/                    # Codec vendor preparation, browser integration tests, and deployers
```

---

## Quick Start

### Prerequisites
* **Node.js**: `^20.11.0` or `^22.0.0` (LTS recommended)
* **pnpm**: `^11.8.0`

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/DejavuMoe/PicForge.git
cd PicForge

# Install dependencies
pnpm install

# Start development server (bound to 127.0.0.1:5173)
pnpm dev
```

### Production Build

```bash
# Build client and bundle reproducible WASM binaries
pnpm build

# Preview production build locally
pnpm preview
```

---

## Quality Assurance & Verification

Before submitting pull requests or cutting a release, execute the full test and verification pipeline:

```bash
# Code style and linting
pnpm lint

# Static type check across all monorepo workspaces
pnpm typecheck

# Unit & WASM integration tests (128 passing tests)
pnpm test

# End-to-end browser check with real sample files (Requires Chromium & native ffprobe)
pnpm exec playwright install chromium
pnpm test:browser
```

---

## Browser Support

| Browser Engine | Desktop | Mobile | Status | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Chromium** (Chrome, Edge, Brave) | ✅ | ✅ | **Fully Verified** | Native H.264 playback, complete PWA offline support, full WASM SIMD. |
| **Gecko** (Firefox) | ✅ | ✅ | **Supported** | Full compression, extraction, and downloads; fallback static preview for MOV. |
| **WebKit** (Safari, iOS Safari) | ✅ | ✅ | **Supported** | Standard Web Workers and WebAssembly; requires no `SharedArrayBuffer`. |

---

## Open Source & Licensing

* **Application Code**: Licensed under the [MIT License](LICENSE).
* **Third-Party Codecs & Binaries**:
  * **FFmpeg WebAssembly Core**: Licensed under [GPL-2.0-or-later](packages/app/public/licenses/FFmpeg-GPL-2.0.txt).
  * **libheif**: Licensed under [LGPL-3.0](packages/app/public/licenses/libheif-LGPL-3.0.txt).
  * **MotionFlow**: Extraction logic incorporated under [MIT License](packages/app/public/licenses/MotionFlow-MIT.txt).
* Complete licensing information and notices are maintained in [NOTICE.txt](packages/app/public/licenses/NOTICE.txt).
