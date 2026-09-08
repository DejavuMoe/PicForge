# Phase 2 — isolated wasm-vips probe

Validated locally on 2026-09-08, branch `codex/wasm-vips-refactor`. No release,
remote deployment, default-engine switch or performance claim is implied.

## Implementation

- Exact dependency `wasm-vips@0.0.18` (reports libvips `8.18.3`).
- Internal `packages/worker/src/vips/vipsProbe.ts`, deliberately absent from the
  worker package's public exports and from the application's default imports.
- One dedicated probe Worker, one initialization promise per Worker, one request
  at a time. Initialization, resize and JPEG output share the same instance.
  Explicit disposal, initialization failure, worker errors, message errors and a
  30-second timeout terminate the Worker; a subsequent call creates another.
- Checks cross-origin isolation, SharedArrayBuffer, Worker and WebAssembly before
  loading. `vipsInitializable` becomes true only after a successful response.
  Actual initialization checks SIMD/exception-handling support; no browser tables.
- Input transfer consumes the supplied ArrayBuffer. Retain the source Blob if a
  caller wants to retry. This is a probe, not the Phase 3 fallback engine API.
  Input bounds: 50 MiB, 50 MP, scale `(0, 1]`; explicit image-handle deletion.
- `?url` imports let Vite emit unmodified, hashed `vips-es6.js` and `vips.wasm`.
  `locateFile` and `mainScriptUrlOrBlob` point Emscripten and its nested workers to
  those local URLs. No copy script, CDN, optional HEIF/JXL/resvg libraries or
  generated binaries added to Git. Upstream notices are preserved in public/licenses.
- Normal `pnpm build` emits no vips JS/WASM. `pnpm test:vips` builds a separate
  temporary entry, leaving the app's codec pipeline and precache policy intact.

Upstream initialization and deployment requirements:
[wasm-vips 0.0.18](https://github.com/kleisauke/wasm-vips/tree/v0.0.18).
The package's JavaScript is MIT; bundled libraries retain their own licenses.
Corresponding-source/relinking obligations still apply before public binary distribution.

## HTTP deployment

Vite dev and preview now both return:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The repository's actual deployment is `.woodpecker/deploy.yml` →
`scripts/publish-site.sh` → static release directory `/var/www/picforge.de`.
It contains no production HTTP server configuration. The publishing script cannot
set response headers; no remote configuration was changed or assumed.

When enabling the preferred engine in production, configure the server/CDN to
send both headers for the main document and JavaScript/Worker resources. For
example, in the existing Nginx site's appropriate server/location scope:

```nginx
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

Merge with existing headers, accounting for Nginx location inheritance; validate
with `nginx -t` and check actual responses before reloading. Other static hosts
need their equivalent response-header configuration. No-header self-hosting
remains supported by the current compatibility pipeline. Cached pages may retain
old headers until refreshed; offline behavior must be checked after such a change.

## Reproducible checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:vips
PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser
```

For Firefox, supply `PICFORGE_BROWSER=firefox` and, if needed,
`PICFORGE_BROWSER_EXECUTABLE=/path/to/firefox` for either browser check.
`PICFORGE_QA_OUTPUT` selects a temporary artifact directory.

Passed on Chromium 145.0.7632.6 and Firefox 151.0:

- Vite production preview and dev-server initialization.
- PNG 320×240 → JPEG 160×120, 1121 bytes, decoded sample RGB `[51,103,153]`
  versus input `[51,102,153]` (tolerance 5/channel).
- Identical instance ID on init/encode; different ID after dispose/rebuild.
- Server-injected vips WASM HTTP 503 reaches the caller, clears availability,
  leaves compatibility PNG→JPEG working, and permits a successful retry.
- Injected dedicated-worker crash clears availability and permits rebuilding.
- No COOP/COEP: unavailable before any vips resource fetch, compatibility encode passes.
- No optional module requests. No uncaught page errors.
- Chromium additionally caches vips through the existing service worker, reloads
  offline and initializes a fresh probe successfully. Firefox probe offline is not asserted.
- Existing production static compression and synthetic Android/iOS acceptance:
  source reconstruction, pairing, cancel/retry, JPEG/H.264/AAC output, timestamps,
  individual/ZIP downloads and responsive layout. Chromium offline reconversion
  passes; Firefox retains its expected static-preview fallback.

128 unit tests pass; lint/typecheck/build pass; frozen install succeeds; audit has
zero advisories. Local artifacts: `/tmp/picforge-phase2/` (not committed).

## Limits before Phase 3

This establishes runtime feasibility, not full image semantics or a speedup.
EXIF orientation, ICC/alpha policy, contain/cover/stretch parity, format routing,
full-resolution memory/latency comparisons and automatic fallback integration
remain later-phase work. Safari/WebKit and real camera fixtures are unverified.

`vips.concurrency(1)` limits image evaluation, **not** Emscripten's worker pool:
0.0.18 preallocates `max(6, navigator.hardwareConcurrency)` pthread workers.
Account for this pool before placing vips inside any application worker pool;
do not multiply instances based only on the nominal concurrency value.
