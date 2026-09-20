import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  STATIC_CODECS,
  staticCodecUrls,
  verifyStaticCodecs,
} from '../packages/app/scripts/static-codecs.mjs';

test('all pinned codec binaries and fallback URLs share the static asset contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'picforge-static-codecs-'));
  try {
    for (const { name, wasm, glue } of STATIC_CODECS) {
      await copyFile(wasm, join(directory, name));
      const source = await readFile(glue, 'utf8');
      const transformed = staticCodecUrls().transform(source, glue).code;
      assert(transformed.includes(`new URL('/wasm/${name}', import.meta.url)`));
      assert.throws(() => staticCodecUrls().transform('changed upstream', glue), /URL changed/);
    }
    assert.equal(staticCodecUrls().transform('untouched', '/app/unrelated.js'), undefined);
    await verifyStaticCodecs(directory);
    await writeFile(join(directory, 'avif_enc.wasm'), 'mismatched WASM');
    await assert.rejects(verifyStaticCodecs(directory), /avif_enc.wasm does not match/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
