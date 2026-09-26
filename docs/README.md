# PicForge documentation

PicForge is a browser-only image toolbox for image compression, Android Motion
Photo extraction and iOS Live Photo conversion. The working package version is
**0.19.0**; package metadata does not establish a release or deployment.

These documents describe the current implementation and its operating constraints.
Validation commands specify how to check a checkout, not a claim that it has passed.

| Document | Contents |
| --- | --- |
| [Architecture](architecture.md) | Packages, processing paths, ownership, assets and deployment |
| [Validation](validation.md) | Required checks, browser/media prerequisites and evidence boundaries |
| [Performance](performance/README.md) | Reusable engine, codec and application measurement commands |
| [Animation](animation-pipeline.md) | GIF/APNG to animated WebP, timing and resource limits |
| [HEIC assets](heif-build.md) | Pinned decoder, integrity checks and deliberate rebuilds |
| [Interface](UI_DESIGN.md) | Current layout, controls and UI automation |
| [QA checklist](QA_CHECKLIST.md) | Manual interaction, accessibility and offline checks |
| [Visual system](design/darkroom-ledger.md) | Colours, typography, geometry and sample provenance |
| [Brand](design/brand.md) | SVG master, generated assets and reproduction |

See [Contributing](../CONTRIBUTING.md) for development,
[AGENTS.md](../AGENTS.md) for repository constraints,
[media fixtures](../sample/README.md) for approved test inputs and
[Security](../SECURITY.md) for vulnerability reporting.
