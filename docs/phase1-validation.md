# Phase 1 — runtime and toolchain modernization

Validated locally on 2026-09-08, on `codex/wasm-vips-refactor`, following Phase 0 commit `caec819`. No wasm-vips dependency or product path was introduced. Product version and service-worker cache version remain 0.15.0; this is not a release or deployment.

## Selected versions

| Component | Phase 0 installed | Phase 1 installed |
| --- | --- | --- |
| Node requirement | Not declared | `>=22.12.0` |
| Node used for validation | 24.20.0 | 24.20.0 |
| pnpm | 11.8.0 | 11.8.0 (already meets the pnpm 11 baseline) |
| Vite / React plugin | 5.4.21 / 4.7.0 | 8.2.2 / 6.1.1 |
| TypeScript | 5.9.3 | 6.0.3 |
| Node types | 20.19.43 | 22.20.1 |
| ESLint | 8.57.1 | 9.39.5 |
| typescript-eslint parser/plugin | 6.21.0 | 8.70.0 |
| React Hooks ESLint plugin | 4.6.2 | 7.1.1 |
| eslint-config-prettier / Prettier | 9.1.2 / 3.8.4 | 10.1.8 / 3.9.6 |
| Vitest | 2.1.9 | 5.0.0 |
| React / React DOM | 18.3.1 | 19.2.8 |
| React / React DOM types | 18.3.31 / 18.3.7 | 19.2.18 / 19.2.7 |
| Zustand | 4.5.7 | 5.0.15 |
| libheif-js | 1.19.8 | 1.23.2 (exact pin) |

TypeScript is bounded to `~6.0.3`: the current [typescript-eslint support range](https://typescript-eslint.io/users/dependency-versions/) is `<6.1.0`, so registry-latest TypeScript 7 was not selected. ESLint 10 requires Node 22.13 on the 22.x line ([package metadata](https://registry.npmjs.org/eslint/10.10.0)); ESLint 9 preserves the specified Node 22.12 floor. Its installer deprecation warning is acknowledged; revisit this choice when the Node floor can move. Actual execution was on Node 24.20.0, not a separately exercised Node 22.12 installation.

The existing Playwright, jSquash, FFmpeg and unrelated runtime libraries remain at their installed versions. The lockfile updates the vulnerable transitive `brace-expansion` 1.1.15 to the compatible 1.1.18 patch. Exact release-age exceptions for the typescript-eslint 8.70.0 family are recorded in `pnpm-workspace.yaml`; the global supply-chain checks remain enabled, and frozen-lockfile installation passed.

## Migration decisions

- Followed the [Vite 6](https://v6.vite.dev/guide/migration), [Vite 7](https://v7.vite.dev/guide/migration) and [Vite 8 migration guides](https://vite.dev/guide/migration). Config uses Oxc, `rolldownOptions` and `codeSplitting.groups` for the existing React vendor chunk. ES2020 targets, module workers, lazy codec imports and generated precache entries remain. The separate benchmark build uses the same new configuration names.
- Root package is explicitly ESM, resolving Vite's native-config warning for `vitest.config.ts`. TypeScript 6 requires explicit Node ambient types for the worker package's native-FFmpeg tests; these were added to that package's tsconfig.
- [Vitest migration](https://vitest.dev/guide/migration/): two store tests replaced the entire `URL` constructor with an object, breaking the new runner's module loading. They now spy only on `createObjectURL` and `revokeObjectURL`. All 128 tests remain; no tests or assertions were deleted.
- ESLint retains the original Rules of Hooks and exhaustive-dependencies gate, with the upgraded TypeScript recommended rules. The new Hooks recommended preset adds 18 diagnostics in existing UI code (state synchronization in effects, nested components and ref initialization). Those additional rules are not silently adopted into a dependency migration; a separate UI audit can address them. The previous lint gate was not weakened.
- [React 19 migration](https://react.dev/blog/2024/04/25/react-19-upgrade-guide): import `JSX` from React instead of relying on the removed global namespace. Existing `createRoot`, initialized refs and JSX transform already meet requirements.
- [Zustand 5 migration](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5): selectors return existing state fields/actions; no new array/object selector results, custom equality function, persist middleware or partial `replace=true` state required migration. Settings behavior remains covered by store/controller tests and browser navigation retention.
- libheif 1.23.2's actual bundled source fixes `is_primary()`. The HEIC worker now uses that public method instead of the old C-binding workaround. Asset-copy paths and third-party notices use 1.23.2. The obsolete generated 1.19.8 directory was removed locally, and the new module's installed/public/dist SHA-256 values match: `d05292271af008d300cc75be374feb8fd35b418a71420a556c3fb817f662b502`. The clean-aperture adapter and FFmpeg configuration are unchanged.

## Verification

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass, including supply-chain checks |
| `pnpm peers check` | No peer dependency issues |
| `pnpm lint` | Pass, no warnings |
| `pnpm typecheck` | App, worker and codecs pass |
| `pnpm test` | 16 files, 128 tests pass |
| `pnpm build` / `pnpm test:browser` | Production Vite 8 build and static browser smoke pass |
| Synthetic Chromium media | HEIC → JPEG, HEVC/PCM MOV → H.264/AAC, Android byte reconstruction, pairing, cancel/retry, ZIP member equality, every source PTS, dimensions and HEIC solid-color fidelity pass |
| Chromium offline | Reload and re-encode both static images and the synthetic iOS pair pass without cross-origin isolation |
| Firefox 151.0 | Synthetic conversion, PTS, downloads, static compression and navigation pass; native H.264 preview unsupported, expected static-preview fallback shown |
| UI check | Light/dark across five viewport sizes, no overflow, keyboard selector interactions, retained queue and mobile compare preview pass; representative desktop/mobile screenshots inspected |
| Audit | Phase 0: 22 advisories (1 critical, 17 high, 4 moderate). Final `pnpm audit --json`: **0** |

The media harness gained `PICFORGE_SYNTHETIC_MEDIA=1`. It generates test signals into its temporary output directory using native `heif-enc` and FFmpeg with libx264/libx265; no image/video fixtures are committed. The original-device fixture mode and its stronger crop/rotation/VFR-specific assertions remain. A retained compressor queue is explicitly cleared via its UI before the final re-import, fixing the Firefox test's assumption that returning to compression always shows the empty drop zone. Page errors are now logged immediately.

The UI harness previously wrote only a JPEG header, so the preview test had no decodable image. It now generates a real Canvas JPEG before adding structural MP4 boxes. These boxes test extraction layout, not video playback; the separate media harness supplies real video. On the first cold dev launch, Vite's dependency optimizer triggered one reload during UI automation; the UI check passed after optimization completed. Production/offline tests did not encounter this dev-only reload.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
PICFORGE_SYNTHETIC_MEDIA=1 pnpm test:browser
pnpm benchmark
pnpm audit

# With the dev server running in another terminal:
node scripts/ui-check.mjs

# Use an installed Playwright-compatible Firefox binary when its default is absent:
PICFORGE_BROWSER=firefox \
PICFORGE_BROWSER_EXECUTABLE=/path/to/firefox \
PICFORGE_SYNTHETIC_MEDIA=1 node scripts/browser-check.mjs
```

## Performance comparison

Same host and Chromium 145.0.7632.6 as [Phase 0](performance-baseline.md). All 22 generated input hashes match; all 21 encoded cases keep the same output dimensions and byte counts; 60 MP is still rejected. Four encoder families, EXIF 1/3/6/8, alpha, animated-GIF first-frame behavior and resize checks pass. The benchmark was taken after runtime migration, before the final dev-only transitive security patch; Phase 0 data was not overwritten.

Warm medians of three samples, milliseconds:

| Case | Phase 0 total | Phase 1 total |
| --- | ---: | ---: |
| JPEG 12 MP | 793.7 | 788.8 |
| JPEG 24 MP | 1615.1 | 1728.6 |
| JPEG 48 MP | 3361.6 | 3293.8 |
| Contain resize | 157.4 | 160.3 |

These are one-host observations with normal desktop activity, not a demonstrated speedup. Decode/resize still run on the main thread. No engine rollout decision is justified by this dependency upgrade.

## Remaining scope

Synthetic signals verify codec execution but do not qualify camera-specific HDR/ICC, Apple identifiers, all clean-aperture/rotation combinations or real variable-frame-rate recordings. Existing parser/geometry tests remain; original private media was unavailable. Safari/physical mobile devices and Firefox offline playback are not newly qualified. The project still needs its normal version/cache bump and license/source-distribution release review when an actual release is requested.
