/**
 * T00 application-layer probe (separate from the engine microbenchmark).
 *
 * Drives the real built application: Landing -> "try sample" -> compressor.
 * Timing and Long Tasks use page-realm marks on the browser's performance
 * timeline, drained before the observer disconnects; Node wall-clock values are
 * separate fields. Every iteration uses a fresh context/page and is labelled
 * "fresh-context" (browser/OS caches are shared, engine instances are not), so
 * no warm median is computed. A real cancel/retry smoke drives the actual UI,
 * controller and store with a generated temporary 48 MP JPEG.
 *
 * Requires a production build (packages/app/dist). Run pnpm build first.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import {
  APPLICATION_BATCH_CASES,
  assertApplicationReport,
  summariseLongTasks,
} from './validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'packages/app/package.json'));
const { preview } = await import(
  resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')
);
const output =
  process.env.PICFORGE_BENCH_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-application-')));
await mkdir(output, { recursive: true });
const engine = process.env.PICFORGE_BROWSER || 'chromium';
assert(['chromium', 'firefox', 'webkit'].includes(engine), `Unknown PICFORGE_BROWSER: ${engine}`);
const repeats = Number(process.env.PICFORGE_BENCH_REPEATS || 3);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20, 'Repeats must be 1–20');
await access(resolve(root, 'packages/app/dist/index.html')).catch(() => {
  throw new Error('Missing packages/app/dist; run pnpm build before the application probe');
});

function commandAvailable(command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const server = await preview({
  root: resolve(root, 'packages/app'),
  configFile: resolve(root, 'packages/app/vite.config.mjs'),
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0, open: false },
});
const origin = server.resolvedUrls.local[0];
const browser = await { chromium, firefox, webkit }[engine]
  .launch({ headless: true })
  .catch(async (error) => {
    await new Promise((done) => server.httpServer.close(done));
    throw error;
  });
const report = {
  schemaVersion: 1,
  layer: 'application',
  date: new Date().toISOString(),
  engine,
  browserVersion: browser.version(),
  repeats,
  origin,
  samples: [],
  failures: [],
  cancelRetry: null,
};
const writeReport = () =>
  writeFile(resolve(output, 'application-results.json'), JSON.stringify(report, null, 2) + '\n');
const readPageMetrics = (page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const records = window.__probe.observer?.takeRecords() ?? [];
    window.__probe.longTasks.push(
      ...records.map((entry) => ({ startTime: entry.startTime, duration: entry.duration })),
    );
    window.__probe.observer?.disconnect();
    const start = performance.getEntriesByName('pf-start')[0]?.startTime ?? null;
    const first = performance.getEntriesByName('pf-first')[0]?.startTime ?? null;
    return {
      supported: window.__probe.supported,
      start,
      first,
      end: performance.getEntriesByName('pf-end')[0]?.startTime ?? null,
      longTasks: window.__probe.longTasks,
    };
  });

async function newProbePage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    locale: 'en-US',
  });
  const page = await context.newPage();
  const errors = [];
  const wasmRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.wasm')) wasmRequests.push(path);
  });
  await page.addInitScript(() => {
    window.__probe = {
      supported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
      longTasks: [],
      observer: null,
    };
    if (window.__probe.supported) {
      window.__probe.observer = new PerformanceObserver((list) =>
        window.__probe.longTasks.push(
          ...list.getEntries().map((entry) => ({
            startTime: entry.startTime,
            duration: entry.duration,
          })),
        ),
      );
      window.__probe.observer.observe({ type: 'longtask', buffered: true });
    }
  });
  return { context, page, errors, wasmRequests };
}

try {
  for (let iteration = 0; iteration <= repeats; iteration += 1) {
    const { context, page, errors, wasmRequests } = await newProbePage();
    const sample = { iteration, temperature: 'fresh-context', status: 'failed' };
    try {
      await page.goto(origin);
      await page.locator('.pf-demo-image img').first().waitFor();
      await page.waitForLoadState('networkidle');

      const nodeStart = Date.now();
      await page.evaluate(() => performance.mark('pf-start'));
      await page.locator('.pf-demo figcaption button').click();
      await page.locator('.pf-file-status-text.is-done').first().waitFor({ timeout: 30000 });
      await page.evaluate(() => performance.mark('pf-first'));
      const nodeFirstResultMs = Date.now() - nodeStart;
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.pf-file-status-text.is-done').length >= 1 &&
          document.querySelectorAll('.pf-file-status-text.is-processing').length === 0,
        undefined,
        { timeout: 30000 },
      );
      await page.evaluate(() => performance.mark('pf-end'));
      const nodeCompletionMs = Date.now() - nodeStart;

      const metrics = await readPageMetrics(page);
      Object.assign(sample, {
        status: 'ok',
        nodeFirstResultMs,
        nodeCompletionMs,
        pageWindowMs:
          metrics.start !== null ? Number((metrics.end - metrics.start).toFixed(3)) : null,
        pageFirstResultMs:
          metrics.start !== null && metrics.first !== null
            ? Number((metrics.first - metrics.start).toFixed(3))
            : null,
        wasmRequests: [...new Set(wasmRequests)],
        ...summariseLongTasks(metrics),
        pageErrors: [...errors],
      });
      console.log(
        `application ${iteration}: pageWindow=${sample.pageWindowMs}ms nodeFirst=${nodeFirstResultMs}ms maxLongTask=${sample.longTaskMaxMs}`,
      );
    } catch (error) {
      sample.error = error instanceof Error ? error.message : String(error);
      sample.pageErrors = [...errors];
      sample.wasmRequests = [...new Set(wasmRequests)];
      report.failures.push(`iteration ${iteration}: ${sample.error}`);
      console.error(`application ${iteration} FAILED: ${sample.error}`);
    } finally {
      await context.close();
    }
    report.samples.push(sample);
    await writeReport();
  }

  // ---- Real-page cancel/retry smoke ----
  const ffmpeg = commandAvailable('ffmpeg');
  if (!ffmpeg) {
    report.cancelRetry = {
      status: 'BLOCKED',
      reason: 'ffmpeg is not available for the temporary 48 MP fixture',
    };
    console.warn('application cancel/retry BLOCKED: ffmpeg is not available');
  } else {
    const bigJpeg = resolve(output, 'cancel-retry-48mp.jpg');
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=8000x6000:rate=1',
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-y',
      bigJpeg,
    ]);
    const { context, page, errors, wasmRequests } = await newProbePage();
    const cancelRetry = { status: 'failed' };
    try {
      await page.goto(origin);
      await page.locator('.pf-demo-image img').first().waitFor();
      await page.locator('.pf-demo figcaption button').click();
      await page.locator('.pf-file-status-text.is-done').first().waitFor({ timeout: 30000 });
      const doneBeforeImport = await page.locator('.pf-file-status-text.is-done').count();

      await page.setInputFiles('[data-testid="add-file-input"]', bigJpeg);
      const row = page.locator('.pf-file-row').last();
      await row.locator('.pf-file-status-text.is-processing').waitFor({ timeout: 60000 });

      const cancelStart = Date.now();
      await row.locator('button[data-tooltip="Cancel"]').click();
      await row.locator('.pf-file-status-text.is-cancelled').waitFor({ timeout: 30000 });
      const cancelAckMs = Date.now() - cancelStart;

      // One terminal outcome: no late stale publication after cancellation.
      await page.waitForTimeout(500);
      const doneAfterCancel = await page.locator('.pf-file-status-text.is-done').count();

      const retryStart = Date.now();
      await row.locator('button[data-tooltip="Retry"]').click();
      await row.locator('.pf-file-status-text.is-processing').waitFor({ timeout: 30000 });
      await row.locator('.pf-file-status-text.is-done').waitFor({ timeout: 90000 });
      const retryDoneMs = Date.now() - retryStart;
      const doneAfterRetry = await page.locator('.pf-file-status-text.is-done').count();

      Object.assign(cancelRetry, {
        status: 'ok',
        cancelAckMs,
        doneBeforeImport,
        doneAfterCancel,
        noLateStalePublication: doneAfterCancel === doneBeforeImport,
        retryDoneMs,
        doneAfterRetry,
        wasmRequests: [...new Set(wasmRequests)],
        pageErrors: [...errors],
      });
      console.log(
        `application cancel/retry: cancelAck=${cancelAckMs}ms retryDone=${retryDoneMs}ms noLateStale=${cancelRetry.noLateStalePublication}`,
      );
    } catch (error) {
      cancelRetry.error = error instanceof Error ? error.message : String(error);
      cancelRetry.pageErrors = [...errors];
      report.failures.push(`cancel/retry: ${cancelRetry.error}`);
      console.error(`application cancel/retry FAILED: ${cancelRetry.error}`);
    } finally {
      await context.close();
    }
    report.cancelRetry = cancelRetry;

    // Two inputs imported together through the real controller/store/UI.
    const batchFiles = [];
    for (const { name, dimensions } of APPLICATION_BATCH_CASES) {
      const path = resolve(output, name);
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `testsrc=size=${dimensions.join('x')}:rate=1`,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        '-y',
        path,
      ]);
      batchFiles.push({ path, dimensions });
    }
    const batchPage = await newProbePage();
    const batch = { status: 'failed', outputs: [] };
    try {
      const page = batchPage.page;
      await page.goto(origin + '?tool=compression');
      const started = await page.evaluate(() => performance.now());
      await page.setInputFiles(
        '[data-testid="add-file-input"]',
        batchFiles.map((file) => file.path),
      );
      await page.locator('.pf-file-status-text.is-done').first().waitFor({ timeout: 60000 });
      const firstResultMs = await page.evaluate((start) => performance.now() - start, started);
      await page.waitForFunction(
        () => document.querySelectorAll('.pf-file-status-text.is-done').length === 2,
        undefined,
        { timeout: 60000 },
      );
      const completionMs = await page.evaluate((start) => performance.now() - start, started);
      for (const [index, file] of batchFiles.entries()) {
        const row = page.locator('.pf-file-row').nth(index);
        const pending = page.waitForEvent('download');
        await row.getByRole('button', { name: 'Download', exact: true }).click();
        const download = await pending;
        const bytes = await readFile(await download.path());
        const dimensions = await page.evaluate(
          async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
            );
            try {
              return [bitmap.width, bitmap.height];
            } finally {
              bitmap.close();
            }
          },
          [...bytes],
        );
        assert.deepEqual(dimensions, file.dimensions, 'application batch downloaded dimensions');
        batch.outputs.push({
          name: download.suggestedFilename(),
          bytes: bytes.length,
          dimensions,
          expected: file.dimensions,
        });
      }
      Object.assign(batch, {
        status: 'ok',
        imported: await page.locator('.pf-file-row').count(),
        completed: await page.locator('.pf-file-status-text.is-done').count(),
        firstResultMs,
        completionMs,
      });
      await page.screenshot({ path: resolve(output, 'application-batch.png') });
    } catch (error) {
      report.failures.push(`application batch: ${error.message}`);
      batch.error = error.message;
    } finally {
      batch.pageErrors = [...batchPage.errors];
      report.batch = batch;
      await batchPage.context.close();
    }
  }

  await writeReport();
  assertApplicationReport(report);
  console.log(
    `PASS: application pageWindow samples=${report.samples.length} cancelRetry=${report.cancelRetry?.status}; results: ${output}`,
  );
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
