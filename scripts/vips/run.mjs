import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, firefox } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'packages/app/package.json'));
const { build, preview, createServer } = await import(
  resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')
);
const output =
  process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-vips-')));
await mkdir(output, { recursive: true });
const outDir = await mkdtemp(resolve(tmpdir(), 'picforge-vips-build-'));
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
      input: resolve(root, 'scripts/vips/browser.ts'),
      output: { entryFileNames: 'probe.js' },
    },
  },
});
await writeFile(
  resolve(outDir, 'index.html'),
  '<!doctype html><title>PicForge vips probe</title><script type="module" src="/probe.js"></script>',
);

const browser = await { chromium, firefox }[process.env.PICFORGE_BROWSER || 'chromium'].launch({
  headless: true,
  ...(process.env.PICFORGE_BROWSER_EXECUTABLE
    ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
    : {}),
});
let server;
try {
  for (const isolated of [true, false]) {
    let failVips = false;
    server = await preview({
      ...config,
      build: { outDir },
      plugins: [
        {
          name: 'probe-init-failure',
          configurePreviewServer(server) {
            server.middlewares.use((request, response, next) => {
              if (failVips && /\/vips-.*\.wasm$/.test(request.url)) {
                response.statusCode = 503;
                response.end('Injected WASM load failure');
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
    const page = await browser.newPage();
    const requests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => !!window.VipsProbe);
    const result = await page.evaluate(async (isolated) => {
      const probe = new window.VipsProbe();
      const capabilities = window.getVipsCapabilities();
      if (!isolated) {
        try {
          await probe.run();
          return { capabilities, error: null };
        } catch (error) {
          return { capabilities, error: error.message };
        } finally {
          probe.dispose();
        }
      }
      try {
        const first = await probe.run();
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#336699';
        ctx.fillRect(0, 0, 320, 240);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        const second = await probe.run(await blob.arrayBuffer());
        const decoded = await createImageBitmap(new Blob([second.buffer], { type: 'image/jpeg' }));
        ctx.drawImage(decoded, 0, 0);
        decoded.close();
        const pixel = Array.from(ctx.getImageData(20, 20, 1, 1).data);
        probe.dispose();
        const third = await probe.run();
        return {
          capabilities,
          initialized: probe.vipsInitializable,
          first,
          second: { ...second, buffer: undefined, bytes: second.buffer.byteLength },
          third,
          pixel,
        };
      } finally {
        probe.dispose();
      }
    }, isolated);
    assert.equal(result.capabilities.crossOriginIsolated, isolated);
    if (isolated) {
      assert.equal(result.initialized, true);
      assert.equal(result.first.instanceId, result.second.instanceId);
      assert.notEqual(result.first.instanceId, result.third.instanceId);
      assert.deepEqual([result.second.width, result.second.height], [160, 120]);
      for (const [i, expected] of [51, 102, 153].entries())
        assert(Math.abs(result.pixel[i] - expected) <= 5, `Probe pixel: ${result.pixel}`);
      assert(requests.some((url) => url.endsWith('.wasm')));
      assert(!requests.some((url) => /vips-(heif|jxl|resvg)/.test(url)));
    } else {
      assert.match(result.error, /unavailable/);
      assert(!requests.some((url) => /vips.*\.(wasm|js)/.test(new URL(url).pathname)));
    }
    const compatibility = await page.evaluate(() => window.verifyCompatEngine());
    assert.equal(compatibility.status, 'ok');
    if (isolated) {
      failVips = true;
      const failure = await page.evaluate(async () => {
        window.probe = new window.VipsProbe();
        try {
          await window.probe.run();
          return 'unexpected success';
        } catch (error) {
          return error.message;
        }
      });
      assert.notEqual(failure, 'unexpected success');
      assert.equal(await page.evaluate(() => window.probe.vipsInitializable), false);
      const afterFailure = await page.evaluate(() => window.verifyCompatEngine());
      assert.equal(afterFailure.status, 'ok');
      failVips = false;
      const nextWorker = page.waitForEvent('worker', (worker) => /vipsWorker/.test(worker.url()));
      await page.evaluate(() => window.probe.run());
      const worker = await nextWorker;
      await worker.evaluate(() => {
        self.onmessage = () => {
          throw Error('Injected worker crash');
        };
      });
      const crash = await page.evaluate(async () => {
        try {
          await window.probe.run();
          return 'unexpected success';
        } catch (error) {
          return error.message;
        }
      });
      assert.match(crash, /Injected worker crash/);
      assert.equal(await page.evaluate(() => window.probe.vipsInitializable), false);
      const recovered = await page.evaluate(() => window.probe.run());
      assert(recovered.version);
      await page.evaluate(() => window.probe.dispose());
      if (!process.env.PICFORGE_BROWSER || process.env.PICFORGE_BROWSER === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.register('/sw.js');
          await navigator.serviceWorker.ready;
        });
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.evaluate(() => window.probe.run());
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
        await page.waitForFunction(() => !!window.VipsProbe);
        const offline = await page.evaluate(async () => {
          const probe = new window.VipsProbe();
          try {
            return (await probe.run()).version;
          } finally {
            probe.dispose();
          }
        });
        assert(offline);
        assert.equal((await page.evaluate(() => window.verifyCompatEngine())).status, 'ok');
        await page.context().setOffline(false);
      }
    }
    await writeFile(
      resolve(output, `probe-${isolated}.json`),
      JSON.stringify({ browser: browser.version(), result, compatibility, requests }, null, 2),
    );
    assert.deepEqual(errors, []);
    await page.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
    server = undefined;
  }
  const dev = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  try {
    await dev.listen();
    const page = await browser.newPage();
    await page.goto(dev.resolvedUrls.local[0]);
    await page.evaluate(
      async (entry) => {
        await import(entry);
      },
      `/@fs/${resolve(root, 'scripts/vips/browser.ts')}`,
    );
    const devVersion = await page.evaluate(async () => {
      const probe = new window.VipsProbe();
      try {
        return (await probe.run()).version;
      } finally {
        probe.dispose();
      }
    });
    assert(devVersion);
    await page.close();
  } finally {
    await dev.close();
  }
  console.log(
    `PASS: vips dev/production init, resize/JPEG, reuse, crash/init-failure recovery, compatibility, isolation guard: ${output}`,
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
