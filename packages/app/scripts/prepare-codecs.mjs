import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = dirname(require.resolve('@ffmpeg/core'));
const heif = dirname(require.resolve('libheif-js'));
for (const [directory, entries] of [
  [
    'ffmpeg-0.12.10',
    [
      [resolve(core, '../esm/ffmpeg-core.js'), 'ffmpeg-core.js'],
      [resolve(core, 'ffmpeg-core.wasm'), 'ffmpeg-core.wasm'],
    ],
  ],
  [
    'heif-1.23.2',
    [
      [resolve(heif, 'libheif-wasm/libheif-bundle.mjs'), 'libheif-bundle.mjs'],
      [resolve(heif, 'libheif-wasm/LICENSE'), 'LICENSE'],
    ],
  ],
]) {
  const target = resolve(root, 'public/wasm', directory);
  await mkdir(target, { recursive: true });
  for (const [source, name] of entries) await copyFile(source, resolve(target, name));
}
