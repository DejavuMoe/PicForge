# PicForge interface and validation

Implemented baseline: **0.16.0**, 2026-09-10. This is a working version, not a release or deployment. The user replaced the green optical direction with a neutral, restrained image utility. See the [current design brief](design/editorial-redesign.md) and [tokens](design/design-tokens.json).

The [previous implementation report](UI_DESIGN.optical-2026-09-09.md) is preserved unchanged from revision `58b797db38ede4779654f0761f905d3fd497e898`. Its optical requirements and screenshots are historical; its unaffected media evidence is not being replaced by new performance claims.

## Product flow

Home presents three direct links: image compression, Android Motion Photos, and iOS Live Photos. A labelled JPEG/WebP sample comparison demonstrates the purpose of the product. Try this image opens a generated, non-personal JPEG in the actual compressor. The preview uses pre-encoded examples; its image sizes are not benchmarks. On mobile, all three tool entries precede the example and are visible in the first viewport.

Every workspace uses a task heading, file list, image viewer, settings/output inspector, and batch action bar. Desktop has a 240px list and 300px inspector around a flexible neutral image mat. At 768–1100px, list and preview share a pane beside settings. Below 768px, selecting a file opens its preview with an explicit return action; settings follow the image in the same scroll area. Batch actions stay outside that scroll area.

Previously visited workspaces stay mounted. Tool switches, home and browser Back/Forward preserve their queues. Reloading or closing the page clears in-memory media, and the update/error copy now says so. No files are persisted or uploaded.

## Visual system

White and graphite surfaces, neutral image mats, system typography and one restrained vermilion accent replace tinted glass. CJK fallback explicitly prefers the appropriate local Noto Sans CJK SC/TC/JP/KR family before platform alternatives, preventing decorative font substitutions without downloading fonts. Headers, panes and file rows are flat. Preview controls sit below the image, with previous/next beside the filename. Fullscreen includes the complete preview and its controls. Images and exported media never inherit a filter.

The header contains a code-native P mark, navigation, native language select and theme toggle. Phones use a native tool select and a compact preferences disclosure. The Landing footer retains centered copyright/GitHub and a separate sponsorship line. The workbench gives space to task actions on mobile; no About or raw license link has been introduced.

Global/per-image and original/result/compare selections use CSS states. Focus is visible, touch controls are at least 44px on phone layouts, and reduced-motion removes transitions/continuous spinner motion. Layout uses progressive CSS enhancement for aligned Motion Photo media; unsupported subgrid falls back to the original flex layout.

## Interaction changes

- Native selects replace the custom popup/portal implementation, providing platform keyboard navigation and touch pickers.
- File selection and download/retry/cancel/remove are independent native buttons. The hidden right-click-only settings menu is removed; the inspector remains the visible route to per-image customization. Offscreen file thumbnails load lazily.
- Number inputs allow an empty or partial draft. Blur/Enter clamps and commits once; Escape restores the original value. This prevents intermediate dimensions from triggering a series of recompressions while typing.
- Disabled resize fields are collapsed. Percentage sizing stays in Advanced settings. PNG clearly identifies its lossless behavior and disables the ineffective quality control.
- Selected results show actual original/output bytes and the percentage increase or decrease. A larger result is labelled as larger, not presented as a saving.
- Global settings preserve complete per-file snapshots, and reconnecting a file to global settings remains explicit.
- Android exposes extraction and downloads without encoder settings. iOS keeps filename-pairing guidance, settings locks, cancellation and retry. Hidden tools pause video. Unsupported native playback still has its static/download fallback.
- Language follows the browser, with English fallback and explicit-only persistence. Theme follows the browser's exposed system preference until explicitly chosen. Blocked local storage does not break either feature.

## Runtime and dependencies

The refactor removes Hyalite, its adapter/observers, the particle renderer, cursor effects, two old hero assets, unused font files/precache entries, and the unused language-detector package. Their applicable license notices remain. No animation library was added.

Landing and compression now have separate lazy entry points. Motion remains lazy. JSZip and FileSaver are retained for their established export behavior. Existing React, Vite, Zustand, i18next, `@jsquash/*`, FFmpeg and libheif versions are preserved. The production engine is still Compat; wasm-vips registration, pthread limits, source Blob ownership, clean-aperture handling and media guards are unchanged.

Native [select controls](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/select) and CSS [feature queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@supports) provide the relevant platform behavior without a new compatibility library.

The root/app version and service-worker cache version are synchronized at 0.16.0. Codec preparation, generated precache manifest and cache algorithms remain intact. App modules may still be fetched by the service worker for offline availability; lazy rendering is not a claim that the service worker never downloads them.

### Build comparison

Same host, Node 24.21.0, pnpm 11.8.0, Vite 8.2.2. Baseline is `58b797db38ede4779654f0761f905d3fd497e898`; comparison is the 0.16.0 working tree. Decimal kB, uncompressed emitted assets:

| Artifact | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main `index` JavaScript chunk | 211.00 kB | 126.15 kB | −40.2% |
| All emitted CSS | 64.23 kB | 47.38 kB | −26.2% |
| Home photographs, combined | 268.27 kB | 203.06 kB | −24.3% |

The shared React vendor chunk remains 189.71 kB. Compression now has a separate 47.40 kB chunk, and Landing a 4.09 kB chunk. These are build-size measurements, not page-load latency, memory/RSS, codec speed, or image-quality benchmarks. Historical media baselines remain independent.

## Verification

Checks ran against the final interface on Linux x86_64. Generated sample photography and synthetic files were used; no private camera fixtures were uploaded or committed.

| Check | Result |
| --- | --- |
| ESLint | Pass |
| App/worker/codec TypeScript | Pass |
| Vitest | 189 tests, 22 files pass, including four locale-contract cases |
| Production build | Pass |
| Chromium 145.0.7632.6 UI | 47 layout captures, 6 interaction groups pass |
| Firefox 146.0.1 UI | 47 layout captures, 6 interaction groups pass |
| Playwright WebKit 26.0 UI subset | 43 layout captures, 3 interaction groups pass: entry, layout, usability |
| Production Chromium | Static compression, downloaded dimensions, mobile width, offline reload and re-encoding pass |
| In-app browser | Homepage, real sample import, format change and rendered preview inspected |

After the final font-only refinement, the entry/layout subset passed again in all three engines (36 captures and one interaction group each). Prior interaction and media evidence is retained because those implementations did not change.

The UI matrix covers all five locales, both themes, desktop, tablet, 390px phones and a focused 320px preview. Checks include no horizontal overflow/framework overlay/runtime errors, keyboard entry/history, global/custom settings, dialog focus/Escape, file/ZIP downloads, sample-to-real-processing, numeric drafts, resize output geometry, lossless guidance, fullscreen controls, 44px preview targets, blocked storage and system-theme changes.

The production test's tool helper now waits for the lazy first screen before choosing its navigation path. The Firefox theme test compares against the browser's actual exposed preference before explicitly emulating changes; it does not assume a context option has already changed `matchMedia`.

### WebKit limitation

The pinned Linux WebKit bundle required Ubuntu compatibility libraries absent from this Arch-based host. The missing ICU 74, libxml2 and Flite packages were downloaded from official Ubuntu package mirrors, verified against their published SHA-256 values and extracted under a temporary directory. No system libraries or settings were changed.

The full interaction run reached the Android invalid-MP4 preview and the native `WPEWebProcess` aborted (SIGABRT). The system core trace places the abort in `libWPEWebKit`; most native frames have no symbols. No OOM kill was recorded, and approximately 20 GiB was available when inspected. This identifies a native runtime failure, but does not prove its exact cause or establish whether it is specific to the host's mixed runtime libraries. No private media was involved.

The independent entry/layout/usability subset, including real JPEG/WebP compression, passed. The Linux WebKit invalid-video/playback path remains unqualified. No production user-agent deny rule, codec fallback change or assertion deletion was introduced to hide this result. Real Safari and physical iPhone/iPad testing are still required for a Safari qualification; Playwright WebKit is not a substitute.

### Reproduction and evidence

With `pnpm dev` running:

```sh
PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs
PICFORGE_UI_BROWSER=firefox PICFORGE_UI_GROUPS=entry,layout,interaction,usability node scripts/ui-check.mjs
PICFORGE_UI_BROWSER=webkit PICFORGE_UI_GROUPS=entry,layout,usability node scripts/ui-check.mjs
pnpm test:browser
```

Use `PICFORGE_UI_EXECUTABLE` only when a test environment needs an explicit browser executable/wrapper. The normal path uses the project's pinned Playwright browser. `PICFORGE_UI_IMAGE`, `PICFORGE_UI_URL` and `PICFORGE_QA_OUTPUT` select the fixture, origin and temporary evidence directory.

Local evidence for this run: `/tmp/picforge-type-chromium`, `/tmp/picforge-type-firefox`, `/tmp/picforge-type-webkit`, `/tmp/picforge-ui-final`, `/tmp/picforge-ui-firefox`, `/tmp/picforge-ui-webkit-safe`, and `/tmp/picforge-production-check.log`. These are temporary, reproducible evidence, not committed product assets. Real HEIC/MOV camera conversion was not repeated: the processing implementation, dependencies, worker policy and encoder arguments did not change. Existing camera and engine qualifications retain their original source revisions.
