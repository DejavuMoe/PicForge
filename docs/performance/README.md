# Compat processing and regression validation

The decode/resize and pixel-ownership changes were accepted on 2026-09-17 after
repairing the allocation guards, codec view handling and validation gates.

- Compat draws the decoded source directly into a validated target-size canvas,
  avoiding an explicit full-source RGBA readback and intermediate source canvas.
- Source dimensions, active resize settings and target allocation are checked;
  contain/cover/stretch/percentage behavior and the original Blob retry source remain.
- Shared encoding normalizes partial, shared and resizable pixel buffers while
  retaining the ordinary full-buffer fast path. Cancellation and stale results
  retain their existing guards.
- Production remains Compat. Vips concurrency/thread limits, codec versions,
  self-hosted assets, service-worker behavior and the approved UI remain unchanged.

Reusable commands and the measurement contract are documented in
[T00-harness.md](T00-harness.md). Core regressions live beside the implementation;
`node --test scripts/performance/validate.test.mjs` checks the acceptance gates.
The approved original media fixtures are documented in [sample/README.md](../../sample/README.md).

Acceptance covered 225 unit tests, 22 validator tests, 20 real-WASM codec/buffer
combinations, representative Chromium/Firefox/Playwright WebKit geometry, color,
alpha and format cases, real-page batch downloads/cancel/retry, and synthetic
media/offline checks. Application batch dimensions are matched against fixed named
cases; corrupt input is accepted only as the exact preflight input failure before
any engine attempt. This summary records acceptance, not a new test run.

Real Safari, isolated T03 end-to-end benefit and process RSS/PSS remain unqualified.
Do not infer release readiness, new speedup numbers or memory recovery from this
summary. The historical, versioned phase and performance baselines remain in `docs/`.

One-off audit/planning reports, raw per-run JSON/logs, reproduction scripts,
screenshots, temporary browser libraries and generated exports were removed after
acceptance. Regenerate them into a temporary directory when diagnosing a new issue;
do not commit run output or copy test fixtures into the production site.
