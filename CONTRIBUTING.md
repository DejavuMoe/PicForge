# Contributing to PicForge

Thanks for helping improve PicForge. This project is a browser-only image toolbox, so privacy, predictable UI, and local processing are the core product constraints.

## Development

```bash
pnpm install
pnpm dev
```

Core checks:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Use Node `^22.13.0 || >=24.0.0` and pnpm 11.8.0. See
[Validation](docs/validation.md) for asset gates, native media prerequisites,
Windows/WSL ownership and change-specific checks, and
[Architecture](docs/architecture.md) for the processing paths.

## Pull Requests

- Keep changes scoped and include tests for store, utility, export, or worker behavior changes.
- For UI work, include browser QA notes for desktop and mobile widths.
- Do not add server upload flows or telemetry that sends user images off device.
- Update the current documentation when behavior, commands or architecture changes.
  Keep change histories and progress reports out of the documentation tree.

## Project Style

- TypeScript, React 19, Vite 8, Zustand, and token-based app-shell CSS.
- Prettier uses semicolons, single quotes, trailing commas, and 100-column width.
- Image processing is local: Compat decodes/resizes in its encoding Worker when supported,
  with a browser Canvas fallback; media conversion uses the dedicated local pipelines.

## Locales and media changes

- Update all five locale files under `packages/app/src/i18n/locales/` together; keep keys and interpolation placeholders aligned. English is the fallback.
- Browser language is the default, with English fallback. Only explicit choices are saved
  under `picforge.language`; `?lng=` is a transient preview and does not change that preference.
- Select the affected checks from [Validation](docs/validation.md); see
  [AGENTS.md](AGENTS.md) for repository constraints.
