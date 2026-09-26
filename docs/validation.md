# Validation

Run checks against the checkout being changed. A package version, an available
test command or a Playwright browser does not prove deployment or device support.
Write reports, screenshots, generated media and benchmark output outside the source
tree. Keep the approved [camera fixtures](../sample/README.md) byte-for-byte intact.

## Environment and core checks

Use Node `^22.13.0 || >=24.0.0` and pnpm 11.8.0. Native `ffmpeg`/`ffprobe` must be
available for media-related tests. Ordinary builds consume the versioned HEIC
assets and require neither Emscripten nor a codec download.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:heif
pnpm test:build
pnpm typecheck
pnpm build
node scripts/verify-site-output.mjs packages/app/dist
```

On this Windows workstation, edit source and perform Git operations in Windows.
Use the disposable Linux build mirror for Linux dependencies, builds and tests:

```powershell
linux-task.ps1 -Mode build -Project 'D:\Forgejo\PicForge' -Command 'pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm test:build && pnpm typecheck && pnpm build && node scripts/verify-site-output.mjs packages/app/dist'
pnpm test:heif
```

Run `test:heif` in the canonical Windows checkout: its Git-attribute checks require
`.git`, which the Linux build mirror intentionally lacks. Do not run concurrent
build-mode jobs against the same project or copy `.git` into the mirror.

## Choose checks for the change

| Change | Relevant checks |
| --- | --- |
| Documentation only | Local links, referenced commands/files, JSON syntax and `git diff --check` |
| Processing, settings or scheduling | Affected unit tests; lint, unit tests, typecheck and build at a coherent implementation boundary |
| UI | [Desktop/mobile checklist](QA_CHECKLIST.md) and selected [UI automation](QA_CHECKLIST.md#current-ui-automation), including keyboard focus |
| Media or shared Worker/FFmpeg runtime | Browser/media acceptance and the affected cancellation, timing or geometry cases |
| Vite, WASM, SW or headers | Dev/production loading, HTTP 304 and cached offline operation |
| Engine performance or default selection | [Same-host measurement](performance/README.md) plus semantic and real-application checks |

Reuse a current build and supported subsets when possible. Expand coverage for a
failure, unresolved risk, dependency change or release decision. Do not run heavy
tests alongside benchmarks or interpret a retry as erasing an unexplained failure.

## Browser and camera acceptance

```sh
pnpm test:browser
# Reuse the same current production build:
node scripts/browser-check.mjs
```

The harness starts its own preview server. `PICFORGE_BROWSER` selects `chromium`
(default), `firefox` or `webkit`; `PICFORGE_BROWSER_EXECUTABLE` selects a compatible
installed browser. `PICFORGE_QA_OUTPUT` selects an external output directory.

Provide `PICFORGE_SAMPLE_ANDROID`, `PICFORGE_SAMPLE_IOS_HEIC` and
`PICFORGE_SAMPLE_IOS_MOV` as described in [sample/README.md](../sample/README.md)
to exercise camera conversion. The real-sample checks need ImageMagick/LCMS and a
recent native ffprobe with frame-cropping support. They check byte reconstruction,
pairing, HEIC colour, video geometry/PTS/colour tags, cancellation, downloads and ZIPs.

```sh
PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser
```

Synthetic media additionally requires `heif-enc` with an HEVC encoder (Debian:
`libheif-plugin-x265`) and native FFmpeg with libx264/libx265. Generated signals
test processing contracts; they do not cover every camera container or colour profile.
Use [animation checks](animation-pipeline.md#验证入口) for GIF/APNG frame semantics.

WebCodecs availability depends on the actual browser, hardware and source codecs.
Check the path that ran and its fallback rather than inferring hardware acceleration
from an API name. Playback, audio/video sync and colour on real Safari/iPhone and
low-memory devices require tests on those devices; Playwright WebKit alone is
insufficient. Offline assertions are harness/browser-specific, not a blanket
guarantee for every browser or a never-loaded engine.

Treat Firefox's stale-HEIF rejection prompt and Linux WebKit's first preview of an
audio-bearing WebCodecs output as explicit acceptance checks. These remain
verification gaps until the complete relevant harness/UI checks pass on the target
runtime; a standalone successful conversion is insufficient. See the
[player behavior](UI_DESIGN.md) for bounded preview reload recovery.

## CI and publication

[test-then-publish.yml](../.woodpecker/test-then-publish.yml) runs on `master` pushes.
It installs with the frozen lockfile, runs the core gates, verifies site output and
executes `sh scripts/test-publish-site.sh packages/app/dist`. The final step publishes
that exact shared-workspace `dist/`; it is the only step mounting `/deploy`.

The publishing test uses a temporary destination. Actual publication uses
`scripts/publish-site.sh` with directory constraints, checksums, locking, stale-run
rejection and an atomic switch. Preserve production concurrency of one. Repository
configuration and local checks do not establish the state of a remote CI run, HTTP
headers or deployment; verify those at the actual revision when releasing.
