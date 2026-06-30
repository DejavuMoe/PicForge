# PicForge Roadmap

> Last updated: 2026-06-30 | Version: 0.14.0

PicForge is ready for a GitHub open-source release pass. The remaining roadmap focuses on automation, export ergonomics, and maintainability.

## Near Term

| Priority | Work                                 | Why                                                          |
| -------- | ------------------------------------ | ------------------------------------------------------------ |
| P0       | GitHub CI workflow                   | Keep public setup reproducible and trustworthy.              |
| P1       | Browser smoke tests                  | Cover PWA install/update/offline behavior and core UI paths. |
| P1       | Virtualized file list                | Keep very large queues responsive.                           |
| P1       | Keyboard shortcuts                   | Improve repeated editing and accessibility.                  |
| P1       | Folder structure preservation in ZIP | Better website asset workflows.                              |

## Product Ideas

- Output filename templates such as `{name}_{quality}.{ext}`.
- Optional export presets for web, social, archive, and high-compression batches.
- Batch selection and operation filters, such as retry failed or export completed only.
- More visible image-dimension diff summaries for resized assets.

## Engineering Ideas

- Explore Worker-side decode/resize with `createImageBitmap` and `OffscreenCanvas` where browser support is reliable.
- Add browser smoke tests around PWA installability and offline refresh.
- Track bundle changes in CI so app-shell and codec chunks stay understandable.
- Keep the current local-only privacy model as a non-negotiable product constraint.
