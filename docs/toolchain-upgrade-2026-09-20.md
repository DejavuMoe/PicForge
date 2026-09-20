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

## JSZip patch

- Upgrade JSZip 3.10.1 to 3.10.2 without changing export names, compression settings
  or manifest structure.
- Add a regression for native Blob, a cross-realm typed-array subview and Unicode
  archive member names; verify extracted bytes and manifest data.
- Verified: lint/typecheck, 227 unit tests, production build/output verification,
  and the Chromium approved-camera/PWA harness including individual downloads,
  ZIP member equality, animation ZIP and offline conversion.
- [Upstream changelog](https://github.com/Stuk/jszip/blob/main/CHANGES.md).

## Vitest patch

- Upgrade Vitest 5.0.0 to 5.0.1, including its matching mocker/spy packages.
- No test configuration, assertion or timeout was weakened.
- Verified: peer checks, lint/typecheck, all 227 unit tests, the 25 HEIF/build
  regressions, production build and output verification.
- [Upstream release](https://github.com/vitest-dev/vitest/releases/tag/v5.0.1).

## One build handed to deployment

- Consolidate into `.woodpecker/test.yml`, retaining the existing `test` workflow
  name. Its test step installs once, runs all gates, builds once, writes
  `SHA256SUMS`, and runs the existing temporary-root publisher regression.
- The next `publish-site` step consumes that same `packages/app/dist` from
  Woodpecker's shared workspace. There is no second install/build or remote
  artifact download; a failed prior step stops publication.
- Only the publish step mounts `/var/www/picforge.de:/deploy`. Keep master push
  gating, the production concurrency group/limit, and the publisher's checksum,
  lock, stale-run rejection, atomic switch and retention logic unchanged.
- Remove the separate `deploy` workflow/status. External branch protection must
  not require that removed status; the retained `test` workflow now covers the
  final publication result too. No remote project settings were modified.
- Verified with the checksum-verified official Woodpecker CLI 3.18.1:
  `woodpecker-cli --disable-update-check lint --strict .woodpecker` passes.
  GNU sha256sum accepts a valid handoff fixture and rejects a post-validation
  mutation. The existing full publisher regression remains in CI.
- No Linux Docker/WSL is available locally, so the actual two-container execution
  and POSIX publisher regression await CI. No push or live publication was run.
- [Woodpecker shared workspace and sequential steps](https://woodpecker-ci.org/docs/usage/workflow-syntax).
