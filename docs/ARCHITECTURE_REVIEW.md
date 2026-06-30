# PicForge Architecture Review

> Review date: 2026-06-30 | Version: 0.14.0

## Summary

The current architecture is suitable for a public GitHub release. The app has clear package boundaries, a local-only privacy model, a stable settings model, and a production build that avoids unnecessary UI runtime weight.

## Strengths

| Area               | Assessment                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Privacy            | Images are processed in the browser and do not need a remote service.                              |
| Package boundaries | App, codecs, and worker packages have directional dependencies.                                    |
| State model        | Global settings and per-image complete snapshots are explicit and testable.                        |
| Preview UX         | Compare modes share zoom/pan state while overlays stay separate from image transforms.             |
| Processing         | WorkerPool isolates WASM encoding work and handles retry/cancel/error paths.                       |
| Release readiness  | License, templates, PWA assets, SEO metadata, and docs are in place; CI remains a future workflow. |

## Risks

| Priority | Risk                                              | Mitigation                                                                                 |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P1       | Very large batches can still be memory intensive. | Keep conservative decode/resize concurrency and add browser smoke tests for large queues.  |
| P1       | Large file queues can make the DOM heavy.         | Add virtualization for the file list.                                                      |
| P1       | Keyboard power-user flows are limited.            | Add shortcuts for navigation, delete, preview mode, reset, and download.                   |
| P2       | Offline behavior is manual-QA only.               | Add browser smoke tests for first load, offline refresh, and service worker cache updates. |

## Recommended Next Work

1. Add GitHub CI workflow and build-size tracking.
2. Add virtual scrolling for file rows.
3. Add keyboard shortcuts and accessibility smoke tests.
4. Preserve folder structure in ZIP export.
5. Add browser smoke tests for PWA install/update/offline behavior.
