# Contributing to PicForge

Thanks for helping improve PicForge. This project is a browser-only image compression tool, so privacy, predictable UI, and local processing are the core product constraints.

## Development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Pull Requests

- Keep changes scoped and include tests for store, utility, export, or worker behavior changes.
- For UI work, include browser QA notes for desktop and mobile widths.
- Do not add server upload flows or telemetry that sends user images off device.
- Update README or docs when behavior, commands, architecture, or release notes change.

## Project Style

- TypeScript, React 18, Vite, Zustand, and native app-shell CSS.
- Prettier uses semicolons, single quotes, trailing commas, and 100-column width.
- Image processing is local: decode and resize through browser APIs, encode through the worker/WASM pipeline.
