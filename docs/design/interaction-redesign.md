# PicForge optical interaction system

> Historical design. Superseded by the 0.16.0 [neutral/vermilion redesign](editorial-redesign.md), following the latest user request. Preserve this document as reference, not as the current implementation specification.

Current implementation direction after the user's visual review, 2026-09-09.
The earlier sparse three-row Landing and CSS-only glass approximation were
rejected. Landing remains the initial entry, followed by explicit tool selection.

## Findings and corrections

| Observed problem                            | Cause                                                                     | Current correction                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Repeated/double underlines                  | Selection inset shadows plus borders; entry separators plus hover outline | One moving selection thumb per control group; no underlines; no entry-row separators                                 |
| Empty page without a focal point            | Whitespace and a headline were doing all the visual work                  | One interactive particle/photo scene balanced against the introduction, with three direct tool entries below         |
| Homepage footer folded despite free space   | Workbench's 1100px breakpoint was reused for Landing                      | Separate footer variants; centered complete Landing links with natural wrapping                                      |
| Raw NOTICE.txt in the primary footer        | Implementation/legal artifact exposed as primary navigation               | Footer About removed by the later annotation; complete license files remain in the distribution                      |
| Preview language became the default         | Detector cached query/browser results like a manual preference            | Canonical browser locales, English fallback, transient URL previews, explicit-only preference storage                |
| Glass indistinguishable from blur           | No displacement filter; material absent from the editor                   | Actual local Hyalite SVG refraction on selected navigation and the image control dock                                |
| Abrupt interaction changes                  | Instant state swaps without shared motion/feedback                        | Sliding selection, responsive pointer light, subtle press feedback, menu/dialog entry and exit, disclosure expansion |
| Current download pushed below long settings | One scrolling inspector including its result footer                       | Independently scrolling settings and a fixed result/download area on desktop                                         |

## Research and what was adopted

- [Hyalite](https://github.com/VII-Cae/hyalite--liquid-glass): a rounded bevel
  represented as a geometry-specific SDF lens map, SVG displacement, and a
  clear center. The unmodified 0.3.0 source and declarations are vendored at
  revision `b0692b8aecdf264fcb49276f45d7d1d1f80f6dd0`. Its MIT notice is preserved.
  `OpticalLayer` supplies scoped React lifetime, visibility/accessibility policy
  and lazy loading. Refraction never goes through application text or encoded data.
- [React Bits](https://github.com/DavidHDev/react-bits), specifically the
  [particle behavior](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Backgrounds/Particles/Particles.tsx)
  and [magnetic interaction](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Animations/Magnet/Magnet.tsx):
  used as interaction references. PicForge's ribbon and pointer light are its
  own bounded canvas/CSS implementation, not copied React Bits code or OGL.
  The native cursor remains; hit targets do not chase the pointer.
- [Motion](https://github.com/motiondivision/motion): shared spatial selection and
  continuity between states informed the motion hierarchy. PicForge uses CSS
  transforms/transitions and the browser Animation API for this scope, with no
  new general animation library.

Hyalite's upstream capability guard requires Chromium because CSS.supports alone
does not prove SVG backdrop painting. The guard and its September-2026 rationale
are preserved in the pinned source. Firefox/WebKit keep the CSS bevel/tint/blur
fallback. Revisit that guard with pixel evidence when SVG backdrop support changes;
do not force refraction merely because a property parses.

## Design and behavior

Landing uses a mineral light background or its deep-green dark counterpart,
a compact optical header, a two-column hero, and three equal-priority tool
entries. A generated local mountain photograph provides the image subject; a
procedural point ribbon supplies motion/depth. The image and glass frame tilt
slightly with a fine pointer; tool links reveal a local light response and arrow
movement. Mobile stacks the hero and entries and scrolls naturally. The footer
shows copyright and GitHub, with sponsorship on its own line. The later user
annotation explicitly removes About; there is no replacement footer menu.

The editor preserves the existing queue/viewer/inspector hierarchy. Selected
navigation, comparison and settings-scope controls each have one moving glass
thumb. Input wells remain quiet and readable. The desktop preview dock floats
above the preview, with real background refraction; on mobile it moves below the
image to avoid covering a large share of the photo. Photo pixels themselves,
zoom/pan math, settings snapshots and export eligibility remain unchanged.

All local license files are retained. The user removed the About footer entry;
its earlier dialog implementation is no longer mounted by the application.

Automatic locale selection maps English/Chinese script-region/Japanese/Korean
variants to the actual resource bundles. Unsupported preferences fall back to
English. Only explicit choices use `picforge.language`. Browser language clears
that explicit preference; `?lng=` is a non-persistent preview override. The old
`i18nextLng` cache is ignored because it cannot distinguish a preview or browser
result from a deliberate choice.

## Motion and resource boundaries

- Selection travel: 260ms, a slight settling curve; menu entry: 180ms; dialog
  entry/exit: 260/140ms; disclosure expansion: 240ms where supported.
- Particle renderer: one 3600-point canvas, half the drawn points on compact
  scenes, DPR capped at 1.5, at most 30 rendered frames per second. No React
  updates in the draw loop. Pause offscreen/hidden; remove the canvas on tool entry.
- Optical maps rebuild after geometry settles, not on every pointer move.
  Identical geometry shares upstream cached maps. Hidden tool scopes detach
  their filters/observers. Dispersion is disabled; a readable fallback is always present.
- Reduced motion freezes the particle scene, disables cursor following and
  transitions, and prevents optical materialization ramps. Reduced transparency
  and forced colors disable backdrop filtering; forced colors hides decorative art.
- All assets/scripts remain local. No telemetry, remote runtime asset, codec,
  Worker, conversion argument, quality setting or default-engine change is introduced.
  This is not a processing performance claim or a camera-media qualification.

## Concept sources and actual output

- [Landing composition](concepts/optical-landing-v2.png)
- [Workbench material/interaction study](concepts/optical-workbench-v2.png)

Both were generated with built-in ImageGen, as design studies. Their logos,
window chrome, sample numbers and incidental wording are illustrative, not
product requirements or measured results. Implementation keeps the actual P
mark, application terminology, version and imported-file metadata. Real UI is
React/CSS/SVG/canvas, never a pasted mockup. Screenshots and recordings of the
implementation remain temporary, outside the repository.

Generation brief: mineral silver/emerald palette; compact optical header;
left-aligned Chinese headline and local-processing sentence; one point-cloud
photographic glass scene; three tool entries without nested frames/underlines;
centered plain-text footer. The editor study retains queue/preview/inspector,
uses one glass selection thumb and a floating preview dock, and prohibits
filtering image results or inventing editor capabilities.

The earlier standalone Alpine photograph was replaced by the prototype-matched
light/dark optical hero artwork described below. No personal media is used.

The generated Landing photograph is included in the build precache manifest, so
offline presentation does not depend on the temporary HTTP cache. WASM remains
outside this eager UI-asset rule. Preview-dock tint and foreground colors also
provide readable controls over both white and black image content.

## Prototype fidelity follow-up

The supplied Landing and workbench images are the active visual references,
subject to the user's explicit removal of About from the footer. This pass adds
the folded green P mark, matching platform silhouettes, independent beveled
queue/viewer/inspector panes, brighter raised selection controls, horizontal
width/height rows with px suffixes, and a floating magnifier/zoom/fullscreen dock.
Percentage sizing remains functional under Advanced settings. Zoom menus mount
inside the fullscreen element so they remain usable in fullscreen preview.

The prior simplified photo/ribbon composition is replaced by separate light and
dark `optical-hero-*.webp` artwork, generated from the accepted Landing reference.
The graphic contains the detailed slab, photograph, particle forms and caustics;
parallax, pointer response and a subtle live particle overlay remain code-driven.
These decorative assets do not stand in for the application's actual controls
or preview results. The two WebP assets total about 268 KB and are precached.
The first attempted transparent extraction produced a checkerboard image and
was rejected, never included in the application.

Desktop footer: copyright and GitHub on one centered line, sponsorship beneath.
Mobile: the same reading order, natural wrapping, no disclosure. Tool status
bars preserve room for progress/export; the compact mobile link is GitHub.

Verified: 40 responsive/localized captures and four interaction groups; percentage
resize still exports a 768px-wide derivative from the 1536px fixture; fullscreen
zoom selection; Android/iOS generated-fixture results in both themes; lint,
185 unit tests, typecheck and build; production static export/offline checks.
Actual screenshots for this pass are in `/tmp/picforge-prototype`.

Latest focused checks also confirm identical panel/control rectangles across
light and dark, and align preview labels to the displayed image while keeping
original/result dimensions, sizes and output format in the preview header.
