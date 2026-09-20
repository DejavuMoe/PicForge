# HEIC static assets and rebuilding

PicForge includes a prebuilt **libheif 1.23.4 + libde265 1.1.1** decoder as
versioned project files. Ordinary development, CI and deployment use those exact
bytes; they do not download a separate codec artifact or run Emscripten.

```sh
pnpm install --frozen-lockfile
pnpm dev
# or: pnpm build
```

## Versioned files

The owner explicitly approved these four files under
`packages/app/public/wasm/heif-1.23.4-de265-1.1.1/` for version control:

- `libheif.mjs` — the browser module (64,151 bytes).
- `libheif.wasm` — the compiled decoder (1,198,749 bytes).
- `LICENSE` — both upstream license texts.
- `build-manifest.json` — source URLs/SHA-256 hashes, native/toolchain versions,
  flags and output hashes.

Vite copies this directory into the static site. The HEIC worker lazily loads
`/wasm/heif-1.23.4-de265-1.1.1/libheif.mjs`; the module loads the adjacent WASM.
Both remain same-origin and work offline after successful loading/caching.
No personal image or test export belongs in this directory.

Only this release's four files are exempted from the generated-HEIF ignore rule.
Other generated builds, temporary output and `dist/` remain ignored. Include all
four files together when committing; the application must not ship a module and
WASM from different builds.
`.gitattributes` disables Git newline conversion for this directory so that the
module, license and manifest keep their exact hashed bytes on Windows and Linux.

## Integrity and ordinary CI

Dev/build preparation checks native versions, critical flags and every artifact
hash from the manifest. Missing, stale or mismatched files stop the build; restore
the versioned files instead of installing a compiler for an ordinary checkout.
Site-output verification also rejects obsolete HEIF directories.

The worker checks actual libheif 1.23.4 and libde265 1.1.1 versions before passing
untrusted bytes to the decoder. The versioned URL and service-worker cache
revision prevent reuse of the previous decoder. The application version remains
0.17.0; this change itself does not publish a release.

Woodpecker uses the checked-out static assets in both its test and deployment
pipelines. Its Node jobs still run the asset gate, build the site and verify site
output. There is no Emscripten image or repeated native compilation in normal CI.
The manifest checks detect missing/mixed/corrupted files; they are not a signature
authenticating a compromised repository or build host.

```sh
pnpm test:heif
pnpm test
pnpm lint
pnpm typecheck
pnpm build
node scripts/verify-site-output.mjs packages/app/dist
```

The existing `pnpm test:browser` checks stale native-version rejection and old
cache eviction. The approved fixture paths in [sample/README.md](../sample/README.md)
enable camera conversion, geometry/PTS, downloads and cached offline conversion.
Keep all generated media temporary.

## Rebuild only when upgrading the decoder

The source build is retained for reproducibility and deliberate upgrades. It is
not a prerequisite for using the project. Activate **Emscripten 3.1.61** using the
[official SDK instructions](https://emscripten.org/docs/getting_started/downloads.html).
Install an up-to-date Python 3.10+ with `tarfile.data_filter`, CMake 3.16+, and
Ninja or Make (Windows requires Ninja). Node must be on PATH.

```sh
python3 scripts/build-heif.py
```

On Windows, `pnpm codecs:heif` uses `python`. An explicit SDK path is also supported:

```powershell
python scripts/build-heif.py --emsdk C:/tools/emsdk
```

The script checks the toolchain version, downloads checksum-pinned upstream
archives, builds static libraries, links upstream `post.js`, and checks both
actual native versions before replacing the four output files. Intermediate
sources/objects stay in an OS temporary directory; `--work-dir PATH` allows reuse.
No media is uploaded. Builds on other toolchains/platforms are not promised to
be byte-identical; normal CI consumes the checked-in build instead.

The approved build used Windows, Emscripten 3.1.61, Python 3.14.7, CMake 3.31.6 and
Ninja 1.11.1. Only libde265 HEVC decoding is enabled; other codecs, plugins,
WebCodecs, uncompressed HEIF, dynamic JavaScript execution, filesystem support
and pthreads are disabled. libde265 1.1.1 includes CVE-2026-54240/54241 fixes and
enables libheif's backend security-limits integration.

For a future version change, update source pins, static directory, ignore
exceptions, build/runtime checks, browser regressions and cache revision together.
Review the generated manifest and normal camera/offline regression results before
replacing the versioned files. Preserve upstream notices and the matching build
recipe. Do not restore the old libheif-js 1.23.2 dependency.

## Redistribution

Keep the LGPL notices and build manifest with the binary. Before public binary
distribution, provide matching source archives and required relinking/build
materials under the upstream licenses; upstream URLs alone are not a substitute.
