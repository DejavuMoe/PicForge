# PicForge interface

Current working version: **0.16.0**, following the 2026-09-10 browser review. This document supersedes the former native-select/automatic-option and centered-desktop-footer decisions. The [preceding report](UI_DESIGN.pre-controls-2026-09-10.md) is preserved from `54f52c4`, including its original validation evidence and build measurements. No deployment is implied.

## Navigation and page structure

The header contains the P mark, tool navigation, and a right-side group with GitHub, language and theme controls. GitHub uses an icon link and is not repeated in the footer. Phones expose language/theme through the preferences menu; GitHub remains visible.

Language has exactly five choices: English, Simplified Chinese, Traditional Chinese, Japanese and Korean. Initial detection still uses the browser with English fallback, but no automatic-detection option or policy label is shown. Explicit choices persist locally, including explicitly selecting the language that is already displayed. URL previews remain transient.

Every normal page uses one shared site footer. Desktop places copyright at the left edge and Riven Cloud sponsorship at the right edge. Mobile centers copyright above sponsorship. Batch actions are a separate region above this footer and appear when files exist. Both copyright and sponsorship remain present on home and all three tool pages.

Home has a direct product heading, a short functional description, one privacy statement, a labelled sample comparison and three tool links. Repeated marketing blocks and the two-line slogan have been removed. The JPEG/WebP sample remains illustrative, and Try sample imports the JPEG into the real compressor.

The workbench keeps its file/viewer/inspector structure, independent tool queues, explicit global/per-image settings and stable scrollbar gutters. On phones, settings follow the preview in one scroll area. File/result media stay in memory until reload/close; the UI does not imply persistent storage.

## One control system

`SelectControl` renders both the closed field and an application-styled listbox. There are no native `<select>` menus on the page. All language, tool, format, resize, preset, frame-rate, advanced-codec and zoom choices use this component.

The popup supports arrows, Home/End, typing to search, Enter, Escape and Tab. Focus stays on the combobox, with `aria-activedescendant` identifying the active option. Disabled choices/fields cannot apply values. Popups stay inside the viewport, escape clipped panels through a portal, and dismiss on outside input, scrolling, resize, history, visibility or fullscreen changes. Fullscreen popups are attached inside the fullscreen element.

Focus decoration follows input mode rather than browser-specific `:focus-visible` heuristics. Pointer/touch input does not leave keyboard focus frames behind. Keyboard navigation keeps a visible indicator. The sample range highlights its handle for keyboard interaction; clicking or dragging it does not outline the whole photograph. Hover decoration is restricted to an exposed fine pointer with hover support.

Number fields retain the previous draft behavior: Enter commits, Escape restores, blur commits, and Enter/Escape retain focus. Native spinner, tap-highlight and inner-focus decorations are reset. Buttons, disclosures, progress bars and selection colors use the same tokens. Forced-colors mode retains visible system-color boundaries and selection.

`TooltipLayer` supplies themed, bounded hints from `data-tooltip`; HTML `title` attributes are not used for visible interface hints. It is non-interactive, delayed for pointer hover, and dismisses on input or scrolling.

`VideoPlayer` uses the browser's media APIs with application-styled play/pause, seek, preview mute and fullscreen controls. Native video controls are not displayed. Seeking and playback do not modify exports. Leaving the tool pauses playback. Unsupported decoding still presents a static preview and a download message; the original extracted video can still be saved.

File selection continues to use the operating system's file picker. The web interface does not imitate or replace the OS filesystem dialog.

## Copy rules

Labels name the action, object or result. Helper text describes a concrete behavior or a limit. Format descriptions and errors avoid generic promises about quality, speed, universality or readiness. Preset hints show their actual format/quality settings. PNG is identified as lossless without pretending its quality slider changes output.

Examples of the final Chinese copy:

| Surface | Copy |
| --- | --- |
| Home heading | 图片工具箱 |
| Home description | 压缩图片、提取动态照片、转换实况照片。 |
| Privacy | 文件不上传，原文件不改动。 |
| Import | 添加图片 / 拖入或粘贴图片。 |
| Sample action | 使用示例 |
| Video fallback | 无法预览视频，仍可下载文件。 |
| Sponsor | Riven Cloud 赞助 |

The approach was informed by [Squoosh's task-first import flow](https://squoosh.app/), [Excalidraw's concrete action labels](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/locales/en.json), and [LocalSend's concise statement of purpose](https://localsend.org/). These are references for editorial decisions, not copied design assets or borrowed product claims. All five locale resources keep the same keys and interpolation parameters.

## Validation and scope

The UI script now opens the actual listboxes and inspects their options, instead of testing only closed native fields. The `controls` group checks home and all three workspaces at 1576×828, 1160×571, 390×844 and 320×844. It verifies five language choices, no native selects or title tooltips, no pointer-focus residue, keyboard selection/focus, popup bounds/dismissal, header GitHub, and desktop/mobile footer ordering.

`details` retains the five-locale shared-column and disclosure-width regressions. `usability` exercises real sample compression, number drafts, resize dimensions, lossless guidance, fullscreen and storage-restricted language/theme behavior. A synthetic two-second H.264/AAC fixture tests the new video controls or the explicit unsupported-preview/download fallback. It contains no personal media.

```sh
# With pnpm dev running
PICFORGE_UI_GROUPS=entry,layout,interaction,usability,details,controls node scripts/ui-check.mjs
PICFORGE_UI_GROUPS=video PICFORGE_UI_VIDEO=/path/to/synthetic.mp4 node scripts/ui-check.mjs
```

Use the existing `PICFORGE_UI_BROWSER`, `PICFORGE_UI_EXECUTABLE`, `PICFORGE_UI_URL` and `PICFORGE_QA_OUTPUT` options. Fixtures, exports and screenshots stay temporary. Browser checks wait for rendered state after resize or asynchronous media events.

The processing engines, resize contracts, source-Blob retry ownership, clean-aperture adapter, frame timing, size guards and Vips policy are unchanged. Production still uses Compat. No dependency upgrade, remote media processing or browser deny rule was added. Camera conversion was not repeated for this UI pass. Existing native WebKit video and real Safari/iPhone qualification limits remain documented in the preceding report; a successful UI subset does not qualify those paths.

### Results for this revision

- Lint and project type checks pass; 189 unit tests in 22 files pass, including all locale contracts. The production build passes.
- Chromium: the full entry/layout/interaction/usability/details/controls pass recorded 59 captures and nine interaction groups. The final pointer/keyboard refinement was checked again with controls/usability: 16 captures and three groups.
- Firefox 146.0.1: controls/usability/details plus the video fallback test pass, with 20 captures and six groups. This host cannot decode the synthetic H.264/AAC fixture in Firefox; the explicit fallback is shown and the MP4 download is byte-identical to the fixture. This is not a claim that video playback passed there.
- Playwright WebKit 26.0: controls/usability/details pass, with 19 captures and five groups. Native video qualification was not repeated in this known-limited Linux runtime.
- Chromium synthetic video: play/pause, seeking, preview mute and pausing a hidden tool pass. No native `controls` attribute is present.
- Production Chromium: static compression, downloaded dimensions, mobile layout, offline reload and re-encoding pass after the new components were bundled.

Temporary evidence: `/tmp/picforge-controls-all-chromium`, `/tmp/picforge-controls-final`, `/tmp/picforge-controls-chromium`, `/tmp/picforge-controls-firefox`, `/tmp/picforge-controls-webkit`, and `/tmp/picforge-controls-production.log`. These are test artifacts, not committed camera media. The in-app browser was also used to inspect the actual open five-language menu and shared footer.
