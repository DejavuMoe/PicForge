# Validation Report — 2026-09-06

Local implementation, version 0.15.0. Acceptance metrics measured during integration baseline testing.

## Default browser output

Chromium production-build run: approximately **10.7 seconds** for the iOS pair on this machine, including engine initialization. Times are observations, not guarantees for other devices.

| Item | Source | Export | Verification |
| --- | ---: | ---: | --- |
| iOS photo | 2,334,561 bytes HEIC | 2,013,062 bytes JPG | 4284 × 5712; MozJPEG quality 85; approximately 13.8% smaller |
| iOS video | 2,892,032 bytes MOV | 943,945 bytes MP4 | H.264 + AAC; 1308 × 1744; approximately 67.4% smaller |
| Android photo | Original Motion Photo | JPG + MP4 | Recombined exported bytes exactly equal the source |

The MOV contains a 1920 × 1440 primary HEVC track, clockwise display rotation, an effective 1744 × 1308 clean aperture, PCM mono audio, auxiliary image tracks and metadata tracks. Only the primary image track and optional first audio track are exported. The clean aperture is mapped into the autorotated frame, so the exported video is 1308 × 1744 with no residual rotation tag. Merely exporting the encoded 1920 × 1440 raster would show unwanted edges.

The source's nominal rate is 150 fps, but it contains **49 frames in approximately 1.667 seconds**. In source-timing mode every exported PTS equals its corresponding source PTS; no frames are duplicated to reach 150 fps. FFmpeg's encoded last-packet duration differs: video track duration is 1.640 seconds, audio/container approximately 1.667 seconds. This final-frame rounding is below one 30 fps frame interval and is explicitly covered by the acceptance tolerance. Source timestamp retention is the contract, not an identical nominal `r_frame_rate` field.

Native FFmpeg SSIM comparison of the actual browser outputs against decoded original sources: JPG approximately **0.9898**, video approximately **0.9821**. These support the selected default on this sample, not a universal visual-quality guarantee. Native and WASM builds differ; HEIC color/HDR/auxiliary fidelity is not claimed.

## Preset exploration

Native FFmpeg was used for a quick parameter comparison on the same MOV, with clean-aperture handling and source timing. The compact result was resized back to reference dimensions for SSIM. Native timing is not used to claim browser speed.

| Candidate | MP4 bytes | SSIM |
| --- | ---: | ---: |
| Quality: CRF 20, long edge ≤1920 | 1,629,280 | 0.9862 |
| Balanced: CRF 23, long edge ≤1920 | 1,072,865 | 0.9813 |
| Compact: CRF 26, long edge ≤1280 | 445,995 | 0.9629 |

Balanced retains most measured quality at substantially lower size than quality mode. Default JPG quality 85 retains high detail at the original resolution. Presets remain adjustable; one supplied pair cannot establish a global optimum.

## Acceptance

- 87 Vitest checks passed, including real Android reconstruction, Apple pairing/ambiguity, malformed signatures and clean-aperture parsing.
- Type checks passed for app, worker and codecs.
- ESLint passed with eight pre-existing `any` warnings in the original codecs/worker code.
- Production build passed; codecs copied reproducibly from pinned npm packages.
- Chromium: Android byte equality, iOS actual WASM conversion, cancellation/retry, JPG/MP4/ZIP downloads with ZIP member equality, playable preview, output codec/dimensions, all source PTS, mobile width, offline reload and conversion, and original compression workflow passed.
- Firefox: actual sample conversion and downloads passed (approximately 77.6 seconds in the final regression run). This Linux Playwright runtime cannot natively play the H.264 output; the UI now offers a static preview and an explicit download-available message. Output validity is checked independently with FFprobe. The final Firefox regression passed extraction, pairing, cancellation/retry, ZIP integrity, codec/dimension/PTS checks, static preview fallback, responsive layout and the original compressor. This is a narrower result than Chromium's complete playback/offline acceptance.
- WebKit could not start in this Linux environment because `libicudata.so.74` is missing. Safari/iOS Safari and Edge were not directly tested; do not represent them as verified. The implementation targets mainstream WASM + worker browsers without requiring SharedArrayBuffer.
- Desktop (1440 × 1000) and mobile-width (390 × 844) screenshots were visually inspected. No horizontal document overflow.

The offline check caught and fixed two old PWA issues: build-generated JS/CSS chunks were not guaranteed to be cached on the first visit, and static cached responses varied with the request Origin under Vite preview. A generated `precache.json` and same-origin static cache lookup now cover both. Heavy HEIC/FFmpeg engines remain lazy and require a first successful online use.

## Reproduction

Run `pnpm test:browser` after installing Playwright Chromium and native `ffprobe` when acceptance files are supplied. The script builds, starts a local preview, validates outputs and writes screenshots/media to a temporary artifact directory. `PICFORGE_BROWSER`, `PICFORGE_BROWSER_EXECUTABLE` and `PICFORGE_QA_OUTPUT` allow another installed engine or output directory.

MotionFlow is integrated into the toolbox; its MIT notice remains in `packages/app/public/licenses/`. The original compressor and its regression checks remain intact.

## Cleanup verification

After removing unused helpers and their three obsolete tests, all remaining tests pass. Lint, app/worker/codecs type checks and production build pass. All unit test fixtures verify byte-for-byte reconstruction and clean-aperture parsing. Current implementation constraints live in `AGENTS.md`; outdated architecture/translation copies and the implementation draft were removed. Browser measurements above are from the initial integration acceptance, not a new browser run during cleanup.
