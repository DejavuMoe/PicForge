import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Reject missing, stale or mixed versioned codec assets before dev/build/publish. */
export async function verifyHeifAssets(directory) {
  try {
    const manifest = JSON.parse(await readFile(resolve(directory, 'build-manifest.json'), 'utf8'));
    assert.equal(manifest.libheif, '1.23.4');
    assert.equal(manifest.libde265, '1.1.1');
    assert.equal(manifest.emscripten, '3.1.61');
    assert.equal(manifest.decoder, 'libde265');
    for (const flag of ['threading', 'dynamicExecution', 'pluginLoading'])
      assert.equal(manifest[flag], false);
    for (const name of ['libheif.mjs', 'libheif.wasm', 'LICENSE']) {
      const bytes = await readFile(resolve(directory, name));
      assert(bytes.length > 0, `Empty HEIF asset: ${name}`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.artifacts[name]);
    }
  } catch (cause) {
    throw new Error(
      'Missing or invalid HEIF static assets. Restore the versioned wasm/heif-1.23.4-de265-1.1.1 files or rebuild with pnpm codecs:heif; see docs/heif-build.md.',
      { cause },
    );
  }
}
