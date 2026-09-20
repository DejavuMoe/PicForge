import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyHeifAssets } from '../../../scripts/verify-heif.mjs';
import { verifyStaticCodecs } from './static-codecs.mjs';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = dirname(require.resolve('@ffmpeg/core'));
assert.equal(
  JSON.parse(await readFile(resolve(core, '../../package.json'), 'utf8')).version,
  '0.12.10',
  'Review FFmpeg asset URLs, cache and clean-aperture handling when upgrading its core.',
);
await verifyHeifAssets(resolve(root, 'public/wasm/heif-1.23.4-de265-1.1.1'));
await verifyStaticCodecs(resolve(root, 'public/wasm'));
// These are generated copies only; never ship an obsolete decoder alongside the fix.
for (const name of ['heif-1.19.8', 'heif-1.23.2', 'heif-1.23.4']) {
  await rm(resolve(root, 'public/wasm', name), { recursive: true, force: true });
}
for (const [directory, entries] of [
  [
    'ffmpeg-0.12.10',
    [
      [resolve(core, '../esm/ffmpeg-core.js'), 'ffmpeg-core.js'],
      [resolve(core, 'ffmpeg-core.wasm'), 'ffmpeg-core.wasm'],
    ],
  ],
]) {
  const target = resolve(root, 'public/wasm', directory);
  await mkdir(target, { recursive: true });
  for (const [source, name] of entries) await copyFile(source, resolve(target, name));
}
