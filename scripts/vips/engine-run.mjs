import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'packages/app/package.json'));
const { build, preview, createServer } = await import(
  resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')
);
const output =
  process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-vips-engine-')));
await mkdir(output, { recursive: true });
const outDir = await mkdtemp(resolve(tmpdir(), 'picforge-vips-engine-build-'));
const config = {
  root: resolve(root, 'packages/app'),
  configFile: resolve(root, 'packages/app/vite.config.mjs'),
  logLevel: 'error',
};
execFileSync(process.execPath, [resolve(root, 'packages/app/scripts/prepare-codecs.mjs')], {
  cwd: root,
});
await build({
  ...config,
  build: {
    outDir,
    rolldownOptions: {
      input: resolve(root, 'scripts/vips/engine-browser.ts'),
      output: { entryFileNames: 'engine.js' },
    },
  },
});
await writeFile(
  resolve(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>PicForge Vips qualification</title>
<style>body{font:16px system-ui;background:#eee;color:#222}section{display:inline-block;vertical-align:top;width:310px;padding:12px}img{width:140px;height:100px;object-fit:contain;background:repeating-conic-gradient(#fff 0% 25%,#ddd 0% 50%) 50%/16px 16px}</style>
<h1>Compat / Vips synthetic comparison</h1><main id="gallery"></main><script type="module" src="/engine.js"></script>`,
);

const fixturesDir = resolve(outDir, 'fixtures');
await mkdir(fixturesDir);
const magick = (args) => execFileSync('magick', args, { stdio: 'pipe' });
const base = resolve(fixturesDir, 'base.png');
magick(['-size', '123x81', 'gradient:#194065-#dcb28a', '-depth', '8', base]);
const gray = resolve(fixturesDir, 'grayscale.png');
magick([base, '-colorspace', 'Gray', '-depth', '8', gray]);
// WebKit can decode WebP but does not implement Canvas WebP encoding.
magick([base, '-quality', '90', resolve(fixturesDir, 'input.webp')]);
const extra = [
  { name: 'webp', url: '/fixtures/input.webp' },
  { name: 'grayscale', url: '/fixtures/grayscale.png' },
];
const profiles = [
  [
    'srgb',
    process.env.PICFORGE_SRGB_PROFILE || '/System/Library/ColorSync/Profiles/sRGB Profile.icc',
  ],
  ['p3', process.env.PICFORGE_P3_PROFILE || '/System/Library/ColorSync/Profiles/Display P3.icc'],
];
const srgb = profiles[0][1];
for (const [name, path] of profiles) {
  if (!existsSync(srgb) || !existsSync(path)) continue;
  const target = resolve(fixturesDir, `${name}.png`);
  magick([
    base,
    '-profile',
    srgb,
    ...(name === 'srgb' ? [] : ['-profile', path]),
    '-depth',
    '8',
    target,
  ]);
  extra.push({ name, url: `/fixtures/${name}.png` });
}
// High bit depth is explicitly deferred; generate it to exercise the input boundary.
magick([
  '-size',
  '16x16',
  'gradient:',
  '-depth',
  '16',
  '-define',
  'png:bit-depth=16',
  resolve(fixturesDir, '16bit.png'),
]);
magick([
  '-delay',
  '10',
  '-size',
  '16x16',
  'xc:red',
  'xc:blue',
  '-loop',
  '0',
  resolve(fixturesDir, 'animated.webp'),
]);
const engineName = process.env.PICFORGE_BROWSER || 'chromium';
const browser = await { chromium, firefox, webkit }[engineName].launch({
  headless: true,
  ...(process.env.PICFORGE_BROWSER_EXECUTABLE
    ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
    : {}),
});
let server;
try {
  for (const isolated of [true, false]) {
    let failWasm = false;
    server = await preview({
      ...config,
      build: { outDir },
      plugins: [
        {
          name: 'engine-faults',
          configurePreviewServer(server) {
            server.middlewares.use((req, res, next) => {
              if (failWasm && /\/vips-.*\.wasm$/.test(req.url)) {
                res.statusCode = 503;
                res.end('Injected load failure');
              } else next();
            });
          },
        },
      ],
      preview: {
        host: '127.0.0.1',
        port: 0,
        open: false,
        headers: {
          'Cache-Control': 'no-store',
          ...(!isolated
            ? {
                'Cross-Origin-Opener-Policy': 'unsafe-none',
                'Cross-Origin-Embedder-Policy': 'unsafe-none',
              }
            : {}),
        },
      },
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => !!window.engine);
    assert.equal(await page.title(), 'PicForge Vips qualification');
    assert.equal(
      await page.evaluate(() => window.getImageRuntimeCapabilities().crossOriginIsolated),
      isolated,
    );
    assert(!requests.some((url) => /vips-.*\.(wasm|js)$/.test(url)), 'Engine must load lazily');
    if (!isolated) {
      assert.equal(await page.evaluate(async () => (await window.runOne('vips')).engine), 'compat');
      assert(!requests.some((url) => /vips-.*\.(wasm|js)$/.test(url)));
    } else {
      const result = await page.evaluate((extra) => window.verifyEngine(extra), extra);
      await writeFile(resolve(output, 'lossless.webp'), Buffer.from(result.sample, 'base64'));
      delete result.sample;
      await writeFile(
        resolve(output, 'semantics.json'),
        JSON.stringify({ browser: browser.version(), extra, ...result }, null, 2),
      );
      await page.screenshot({ path: resolve(output, 'comparison.png'), fullPage: true });
      console.log(
        `Semantics passed: ${result.cases.length} cases; ${JSON.stringify(result.losslessMetrics)}`,
      );
      const encoderOptions = await page.evaluate(() => window.verifyOptions());
      await writeFile(
        resolve(output, 'encoder-options.json'),
        JSON.stringify(encoderOptions, null, 2),
      );
      const boundaries = await page.evaluate(async () => {
        const source = await window.fixture(120, 80, 'image/png', 'photo');
        const request = {
          id: 'boundary',
          source,
          settings: { outputFormat: 'mozjpeg', quality: 75 },
        };
        const failures = [];
        for (const url of ['/fixtures/16bit.png', '/fixtures/animated.webp']) {
          try {
            await window.engine.process({ ...request, source: await (await fetch(url)).blob() });
            throw Error(`Unexpected success: ${url}`);
          } catch (error) {
            if (error.failure !== 'input') throw error;
            failures.push(error.message);
          }
        }
        for (let i = 0; i < 3; i++) {
          try {
            await window.engine.process({
              ...request,
              source: new Blob([new Uint8Array([255, 216, 255, 224, 0, 0])], {
                type: 'image/jpeg',
              }),
            });
            throw Error('Corrupt input succeeded');
          } catch (error) {
            if (error.failure !== 'input') throw error;
          }
        }
        if ((await window.engine.process(request)).engine !== 'vips')
          throw Error('Input errors poisoned runtime');
        for (const settings of [
          { outputFormat: 'mozjpeg', quality: 85 },
          { outputFormat: 'mozjpeg', quality: 75, advanced: { trellis_multipass: true } },
          { outputFormat: 'webp', quality: 75, advanced: { near_lossless: 80 } },
          { outputFormat: 'oxipng', quality: 75 },
          { outputFormat: 'avif', quality: 75 },
        ]) {
          if ((await window.processor.process({ ...request, settings })).engine !== 'compat')
            throw Error('Unsupported option did not fall back');
        }
        return {
          failures,
          corruptInputs: 3,
          settingsFallbacks: 5,
          breaker: window.processor.vipsDisabled,
        };
      });
      assert.equal(boundaries.breaker, false);

      // The parent plus its nested pthreads must remain bounded even on high-core hosts.
      const cdp = engineName === 'chromium' ? await page.context().newCDPSession(page) : null;
      const targets = async () =>
        cdp
          ? (await cdp.send('Target.getTargets')).targetInfos.filter(
              (target) =>
                target.type === 'worker' && /\/vips(?:-es6|EngineWorker)-/.test(target.url),
            )
          : [];
      const beforeCancel = await targets();
      if (cdp) {
        assert.equal(beforeCancel.filter((target) => /vips-es6-/.test(target.url)).length, 6);
        assert.equal(
          beforeCancel.filter((target) => /vipsEngineWorker-/.test(target.url)).length,
          1,
        );
      }
      const activeWorker = page.workers().find((worker) => /vipsEngineWorker-/.test(worker.url()));
      assert(activeWorker);
      await page.evaluate(async () => {
        window.largeSource = await window.fixture(5000, 4000, 'image/png', 'photo');
        const small = await window.fixture(32, 24, 'image/png', 'photo');
        window.cancel = new AbortController();
        window.cancelled = window.engine
          .process(
            {
              id: 'cancel-running',
              source: window.largeSource,
              settings: {
                outputFormat: 'webp',
                quality: 100,
                advanced: { lossless: 1, method: 6 },
              },
            },
            window.cancel.signal,
          )
          .then(
            () => 'unexpected success',
            (error) => error.name,
          );
        window.queued = window.engine.process({
          id: 'after-cancel',
          source: small,
          settings: { outputFormat: 'mozjpeg', quality: 75 },
        });
      });
      await page.waitForFunction(() => window.engine.phase === 'processing');
      const closed = activeWorker.waitForEvent('close');
      const cancellation = await page.evaluate(async () => {
        const start = performance.now();
        window.cancel.abort();
        return {
          outcome: await window.cancelled,
          next: (await window.queued).engine,
          elapsedMs: performance.now() - start,
        };
      });
      await closed;
      assert.equal(cancellation.outcome, 'AbortError');
      assert.equal(cancellation.next, 'vips');
      if (cdp) {
        let remaining = await targets();
        for (
          let i = 0;
          i < 20 &&
          remaining.some((target) => beforeCancel.some((old) => old.targetId === target.targetId));
          i++
        ) {
          await new Promise((done) => setTimeout(done, 50));
          remaining = await targets();
        }
        await writeFile(
          resolve(output, 'cancellation-targets.json'),
          JSON.stringify({ beforeCancel, remaining, cancellation }, null, 2),
        );
        assert(
          !remaining.some((target) => beforeCancel.some((old) => old.targetId === target.targetId)),
          'Cancelled descendants survived',
        );
        assert.equal(remaining.length, 7);
      }
      const crashWorker = page.workers().find((worker) => /vipsEngineWorker-/.test(worker.url()));
      await crashWorker.evaluate(() => {
        self.onmessage = () => {
          throw new Error('Injected Vips engine crash');
        };
      });
      const crash = await page.evaluate(async () => {
        const source = await window.fixture(32, 24, 'image/png', 'photo');
        const local = window.createImageProcessor(window.compat, window.engine);
        const request = { id: 'crash', source, settings: { outputFormat: 'mozjpeg', quality: 75 } };
        return {
          fallback: (await local.process(request)).engine,
          recovered: (await local.process(request)).engine,
          breaker: local.vipsDisabled,
        };
      });
      assert.deepEqual(crash, { fallback: 'compat', recovered: 'vips', breaker: false });

      // A dedicated real-WASM watchdog test. Dispose the other lane first.
      await page.evaluate(() => window.engine.dispose());
      const beforeTimeout = await targets();
      const timeout = await page.evaluate(async () => {
        const timed = new window.VipsImageEngine(undefined, 2000);
        try {
          const small = await window.fixture(32, 24, 'image/png', 'photo');
          await timed.process({
            id: 'warm',
            source: small,
            settings: { outputFormat: 'mozjpeg', quality: 75 },
          });
          const start = performance.now();
          try {
            await timed.process({
              id: 'timeout',
              source: window.largeSource,
              settings: {
                outputFormat: 'webp',
                quality: 100,
                advanced: { lossless: 1, method: 6 },
              },
            });
            return { unexpected: true };
          } catch (error) {
            return {
              failure: error.failure,
              message: error.message,
              phase: timed.phase,
              elapsedMs: performance.now() - start,
            };
          }
        } finally {
          timed.dispose();
        }
      });
      assert.equal(timeout.failure, 'runtime');
      assert.match(timeout.message, /watchdog/);
      assert.equal(timeout.phase, 'idle');
      if (cdp) {
        let remaining = await targets();
        for (let i = 0; i < 100 && remaining.length; i++) {
          await new Promise((done) => setTimeout(done, 50));
          remaining = await targets();
        }
        await writeFile(
          resolve(output, 'timeout-targets.json'),
          JSON.stringify({ beforeTimeout, remaining, timeout }, null, 2),
        );
        assert.equal(remaining.length, 0);
      }
      await writeFile(
        resolve(output, 'lifecycle.json'),
        JSON.stringify(
          { boundaries, threads: cdp ? 6 : 'CDP unavailable', cancellation, crash, timeout },
          null,
          2,
        ),
      );
      console.log(
        'Input boundaries, running cancellation, queued recovery, crash fallback and watchdog passed',
      );
      await page.evaluate(() => window.engine.dispose());
      failWasm = true;
      assert.equal(await page.evaluate(async () => (await window.runOne()).engine), 'compat');
      assert.equal(await page.evaluate(() => window.processor.vipsDisabled), false);
      assert.equal(await page.evaluate(async () => (await window.runOne()).engine), 'compat');
      assert.equal(await page.evaluate(() => window.processor.vipsDisabled), true);
      failWasm = false;
      const before = requests.length;
      assert.equal(await page.evaluate(async () => (await window.runOne()).engine), 'compat');
      assert(!requests.slice(before).some((url) => /vips-.*\.wasm$/.test(url)));
      if (engineName === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.register('/sw.js');
          await navigator.serviceWorker.ready;
        });
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.evaluate(async () => {
          const source = await window.fixture(120, 80, 'image/png', 'photo');
          await window.engine.process({
            id: 'cache',
            source,
            settings: { outputFormat: 'webp', quality: 75 },
          });
        });
        await page.waitForFunction(async () => {
          for (const name of await caches.keys()) {
            if (
              (await (await caches.open(name)).keys()).some((request) =>
                /vips-.*\.wasm$/.test(request.url),
              )
            )
              return true;
          }
          return false;
        });
        await page.context().setOffline(true);
        await page.reload();
        await page.waitForFunction(() => !!window.engine);
        assert.equal(await page.evaluate(async () => (await window.runOne()).engine), 'vips');
        await page.context().setOffline(false);
      }
      await cdp?.detach();
    }
    await page.evaluate(() => window.disposeEngines());
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(output, `runtime-${isolated}.json`),
      JSON.stringify({ browser: browser.version(), requests }, null, 2),
    );
    await page.close();
    await new Promise((done) => server.httpServer.close(done));
    server = undefined;
  }
  const dev = await createServer({
    ...config,
    cacheDir: await mkdtemp(resolve(tmpdir(), 'picforge-vips-dev-cache-')),
    // This qualification entry lives outside index.html. Include it in the
    // initial dependency scan instead of provoking a mid-assertion HMR reload.
    optimizeDeps: {
      entries: [
        resolve(root, 'packages/app/index.html'),
        resolve(root, 'scripts/vips/engine-browser.ts'),
      ],
    },
    server: { host: '127.0.0.1', port: 0 },
  });
  try {
    await dev.listen();
    await dev.environments.client.depsOptimizer?.scanProcessing;
    const moduleUrl = new URL(
      `/@fs/${resolve(root, 'packages/worker/src/encoderOptions.ts')}`,
      dev.resolvedUrls.local[0],
    );
    const first = await fetch(moduleUrl);
    const cached = await fetch(moduleUrl, {
      headers: { 'If-None-Match': first.headers.get('etag') },
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal(cached.headers.get('cross-origin-opener-policy'), 'same-origin');
    const page = await browser.newPage();
    await page.goto(dev.resolvedUrls.local[0]);
    await page.evaluate(
      async (entry) => {
        await import(entry);
      },
      `/@fs/${resolve(root, 'scripts/vips/engine-browser.ts')}`,
    );
    const devResult = await page.evaluate(async () => {
      const result = await window.runOne('vips');
      window.disposeEngines();
      return { engine: result.engine, width: result.width, height: result.height };
    });
    assert.deepEqual(devResult, { engine: 'vips', width: 120, height: 80 });
    await writeFile(
      resolve(output, 'dev.json'),
      JSON.stringify({ browser: browser.version(), ...devResult }, null, 2),
    );
    await page.close();
  } finally {
    await dev.close();
  }
  console.log(`PASS: Vips image engine qualification: ${output}`);
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.httpServer.close(done));
}
