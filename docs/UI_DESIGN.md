# Glass workbench UI

## Shared structure

Home and all three tools use the existing blue/gray palette and a continuous
header. Desktop navigation is centered on the viewport; phones use a flat tab row
with an underline for the current tool. Switching retains visited queues. The home brand
returns to the landing page; the tool cards and header navigation open the same
workspaces.

`ToolHeading` gives every tool the same icon, title, description, spacing and
optional batch actions. Empty tools display a local-processing note instead of
an empty 0/0 counter. On phones, compression hides its redundant heading after
import; the selected navigation item identifies the workspace.

## Import and processing

- All empty import cards are at most 760px wide with a 250px upload surface.
  Their top edge, icon, typography, action and glass treatment match.
- Compression expands into the full-width file queue/preview after import.
  Existing per-image snapshots remain intact. Every select uses the shared
  `SelectControl` combobox and an authored portal listbox, including advanced
  encoding and per-image resize controls. Keyboard arrows, Home/End, type-ahead,
  Enter, Escape, Tab, outside dismissal and viewport positioning are supported.
- Motion tools keep upload, pairing guidance and export settings in a single
  card. Android uses three clear output facts. iOS uses two columns of controls,
  with full-width selects on narrow phones.
- Imported motion queues use a compact upload strip. Processing puts the queue
  and results first. Export settings have no disclosure: iOS settings stay below
  results and Android hides its read-only setup information. Existing setting locks
  still apply. Pairing guidance is shown before processing, not above results.
- Selected controls use pale blue; primary actions use solid blue. Neutral borders
  identify secondary actions. Controls wrap on small screens; preview mode and
  zoom remain available.

## Glass and motion

The CSS material is implemented locally: translucent gradient, asymmetric edge
highlights, inset bottom shading, a soft shadow and backdrop blur/saturation.
It borrows the beveled-glass visual idea without importing Hyalite or claiming
physical SVG refraction. Media comparison surfaces remain opaque. No dependency,
remote asset or processing request was added.

Glass is used for header/menu surfaces and entry/import cards. Result cards use
quiet opaque surfaces to keep attention on media. Reduced
transparency uses an opaque card fallback. Focus and pressed states remain visible.
Card entrance uses a short 6px rise; hover movement is small. Existing reduced
motion rules suppress animation. The particle renderer pauses offscreen/when hidden.

The landing hero is content-sized so tools appear sooner. Light-theme particles
use darker colors and correct premultiplied-alpha blending, avoiding washed-out
canvas composition. Larger point sizes make the field readable in both themes.
WebGL failure still leaves readable content and the static gradient background.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (128 tests), `pnpm build`.
- `pnpm test:browser`: Chromium acceptance checks, original Android bytes, iOS timestamps,
  cancellation/retry, downloads and offline reload/conversion.
- With `pnpm dev` running, `node scripts/ui-check.mjs` checks light/dark themes,
  five viewports (375, 735, 768, 1280 and 1576px), queue retention and mobile preview.
  It writes screenshots to a printed temporary directory.
- Additional visual checks: desktop/mobile home and tools, five-locale mobile iOS
  settings, custom listbox keyboard/pointer selection, and loaded compression preview.
- Firefox and Safari/WebKit were not rerun for this design pass.

No release/deployment.

## Design references

- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials):
  use the material selectively for controls/navigation and keep content readable.
- [Linear interface refresh](https://linear.app/now/behind-the-latest-design-refresh):
  consistent placement of navigation/actions; supporting interface recedes behind
  the task. These inform the layout; no third-party design code is imported.
