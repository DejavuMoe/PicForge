import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyHeifAssets } from './verify-heif.mjs';

test('versioned HEIF assets validate and retain exact bytes through Git filters', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = 'packages/app/public/wasm/heif-1.23.4-de265-1.1.1';
  await verifyHeifAssets(join(root, directory));
  for (const name of ['libheif.mjs', 'libheif.wasm', 'LICENSE', 'build-manifest.json']) {
    const path = `${directory}/${name}`;
    const bytes = await readFile(join(root, path));
    const raw = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    for (const autocrlf of ['true', 'false']) {
      const filtered = execFileSync(
        'git',
        ['-c', `core.autocrlf=${autocrlf}`, 'hash-object', '--path', path, '--stdin'],
        { cwd: root, input: bytes, encoding: 'utf8' },
      ).trim();
      assert.equal(filtered, raw, `${name}: Git must not normalize the pinned bytes`);
    }
  }
});

test('HEIF build gate rejects missing, stale, unsafe and mismatched artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'picforge-heif-gate-'));
  try {
    await assert.rejects(verifyHeifAssets(directory), /Restore the versioned/);
    const manifest = {
      libheif: '1.23.4',
      libde265: '1.1.1',
      emscripten: '3.1.61',
      decoder: 'libde265',
      threading: false,
      dynamicExecution: false,
      pluginLoading: false,
      artifacts: {},
    };
    for (const name of ['libheif.mjs', 'libheif.wasm', 'LICENSE']) {
      await writeFile(join(directory, name), name);
      manifest.artifacts[name] = createHash('sha256').update(name).digest('hex');
    }
    const save = (value) =>
      writeFile(join(directory, 'build-manifest.json'), JSON.stringify(value));
    await save(manifest);
    await verifyHeifAssets(directory);
    for (const changed of [
      { libheif: '1.23.2' },
      { libde265: '1.0.15' },
      { dynamicExecution: true },
    ]) {
      await save({ ...manifest, ...changed });
      await assert.rejects(verifyHeifAssets(directory));
    }
    await save(manifest);
    await writeFile(join(directory, 'libheif.wasm'), 'stale binary');
    await assert.rejects(verifyHeifAssets(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
