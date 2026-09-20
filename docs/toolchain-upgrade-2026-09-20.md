# Incremental toolchain upgrades (2026-09-20)

These upgrades follow the static-codec review committed in `48a5b61`.
All changes are local commits; no push or deployment is part of this work.
The earlier review reports remain historical evidence.

## ESLint 10

- Upgrade ESLint 9.39.5 to 10.11.0. Existing flat configuration and rules are unchanged.
- Align the declared Node support range with the combined toolchain:
  `^22.13.0 || >=24.0.0`. CI remains Node 24.21.0; no browser support changes.
- Existing TypeScript ESLint 8.70.0, React Hooks 7.1.1 and Prettier config 10.1.8
  support ESLint 10; TypeScript stays 6.0.3 within the parser's support range.
- Verified on Node 24.21.0: no peer conflicts, lint passes with the same 7 existing
  warnings, typecheck passes, 226 unit tests pass, production build/output verification passes.
- [ESLint migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0).
