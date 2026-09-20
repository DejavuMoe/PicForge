import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';

const require = createRequire(new URL('../../codecs/package.json', import.meta.url));
export const STATIC_CODECS = [
  ['mozjpeg_enc.wasm', '@jsquash/jpeg/codec/enc/mozjpeg_enc'],
  ['webp_enc.wasm', '@jsquash/webp/codec/enc/webp_enc'],
  ['webp_enc_simd.wasm', '@jsquash/webp/codec/enc/webp_enc_simd'],
  ['avif_enc.wasm', '@jsquash/avif/codec/enc/avif_enc'],
  ['oxipng.wasm', '@jsquash/oxipng/codec/pkg/squoosh_oxipng'],
].map(([name, entry]) => ({
  name,
  glue: require.resolve(`${entry}.js`).replaceAll('\\', '/'),
  wasm: require.resolve(`${entry}${name === 'oxipng.wasm' ? '_bg' : ''}.wasm`),
}));

export async function verifyStaticCodecs(directory) {
  for (const { name, wasm } of STATIC_CODECS) {
    assert(
      (await readFile(resolve(directory, name))).equals(await readFile(wasm)),
      `${name} does not match the installed codec. Update the pinned package and static WASM together.`,
    );
  }
}

/** Reuse the public WASM even for upstream's fallback URL; do not emit a second copy. */
export function staticCodecUrls() {
  return {
    name: 'picforge-static-codec-urls',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const asset = STATIC_CODECS.find(({ glue }) => glue === id.replaceAll('\\', '/'));
      if (!asset) return;
      const output = code.replace(
        /new URL\((["'])([^"']+\.wasm)\1,\s*import\.meta\.url\)/g,
        (expression, _quote, name) =>
          name === basename(asset.wasm)
            ? `new URL('/wasm/${asset.name}', import.meta.url)`
            : expression,
      );
      assert.notEqual(
        output,
        code,
        `Upstream WASM URL changed: ${asset.name}; review the static asset mapping.`,
      );
      return { code: output, map: null };
    },
  };
}
