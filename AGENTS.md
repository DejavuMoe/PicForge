# PicForge — Agent Guide

PicForge is a browser-based batch image compression and resizing tool. All image processing is local: browser Canvas APIs decode/resize, and Web Workers run WASM encoders from `@jsquash/*`.

## Commands

| Command                                 | Action                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                              | Dev server at `localhost:5173` for `@pic-forge/app`.                            |
| `pnpm build`                            | Production build to `packages/app/dist/`.                                       |
| `pnpm preview`                          | Preview the production build.                                                   |
| `pnpm lint`                             | ESLint for `packages/*/src/**/*.{ts,tsx}`.                                      |
| `pnpm format`                           | Prettier with semicolons, single quotes, trailing commas, and 100-column width. |
| `pnpm test`                             | Vitest test suite.                                                              |
| `pnpm test:watch`                       | Vitest watch mode.                                                              |
| `pnpm typecheck`                        | Type-check app, worker, and codecs packages.                                    |
| `pnpm --filter @pic-forge/app <script>` | Run an app package script directly.                                             |

## Project Structure

```text
packages/
  app/      React 18 + Vite 5 native app shell, i18n, stores, export UI, PWA files
  codecs/   WASM codec loader and shared compression setting types
  worker/   WorkerPool, image decode/resize helpers, and encode orchestration
```

- All packages use `"type": "module"`.
- Internal dependencies use `workspace:*`.
- Package exports point to `.ts` source files and are resolved by Vite/TypeScript.
- Vite excludes `@pic-forge/codecs` and `@pic-forge/worker` from `optimizeDeps`.

## Architecture

- **Entrypoint**: `packages/app/src/main.tsx` -> `ThemeProvider` -> `App`.
- **Layout**: `Header` / `Toolbar` / `Workspace` (`FileList` + `Preview`) / `StatusBar`.
- **UI shell**: native React components plus `packages/app/src/app-shell.css`.
- **State**: Zustand stores (`fileStore.ts`, `settingsStore.ts`); presets in `presets.ts`.
- **Settings model**: global settings plus complete per-image custom snapshots.
- **Auto-compress**: `useAutoCompress` watches files/settings, debounces, validates dimensions, decodes/resizes with bounded concurrency, and queues encoding to `WorkerPool`.
- **Preview**: slider, side-by-side, and single-image modes with click-to-inspect zoom, 2x pan, and overlay layers that do not scale with the image.
- **Export**: single download or ZIP with `picforge-manifest.json`.
- **i18n**: `react-i18next`, 5 locales (`en`, `zh-CN`, `zh-TW`, `ja`, `ko`).
- **PWA**: manifest, install icons, service worker cache, offline refresh after first successful load, and foreground update prompt.

## Key Quirks & Gotchas

1. **WASM files must be in `packages/app/public/wasm/`** — codec loading resolves them from `/wasm/`.
2. **No CI workflow is currently included** — run `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build` locally before release.
3. **Tests run in `node` environment** — mock browser APIs with `vi.stubGlobal` when needed.
4. **Version sync** — root and app package versions should match.
5. **Service worker cache version** — update `CACHE_VERSION` in `packages/app/public/sw.js` when shipping a new app version.
6. **Do not commit build output** — `node_modules/`, `packages/app/dist/`, and `*.tsbuildinfo` are ignored.
7. **Local-only privacy model** — do not add upload flows, telemetry, or remote image processing without explicit product approval.
8. **Resize semantics** — `contain` fits within bounds without upscaling, `cover` fills target dimensions with centered crop, and `stretch` uses exact dimensions.
