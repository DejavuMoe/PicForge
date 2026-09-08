import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'packages/app/package.json'));
const { build, preview } = await import(
  resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')
);
const output =
  process.env.PICFORGE_BENCH_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-baseline-')));
await mkdir(output, { recursive: true });
const outDir = await mkdtemp(resolve(tmpdir(), 'picforge-benchmark-build-'));
const engine = process.env.PICFORGE_BROWSER || 'chromium';
const repeats = Number(process.env.PICFORGE_BENCH_REPEATS || 3);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20, 'Repeats must be 1–20');
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
      input: resolve(root, 'scripts/performance/browser.ts'),
      output: { entryFileNames: 'benchmark.js' },
    },
  },
});
await writeFile(
  resolve(outDir, 'index.html'),
  '<!doctype html><title>PicForge baseline</title><script type="module" src="/benchmark.js"></script>',
);
const server = await preview({
  ...config,
  build: { outDir },
  preview: { host: '127.0.0.1', port: 0, open: false },
});
let browser;
const cases = [
  ...[
    [4000, 3000],
    [6000, 4000],
    [8000, 6000],
    [10000, 6000],
  ].map(([width, height]) => ({
    name: `jpeg-${(width * height) / 1e6}mp`,
    width,
    height,
    mime: 'image/jpeg',
    kind: 'photo',
  })),
  { name: 'png-photo', width: 2400, height: 1600, mime: 'image/png', kind: 'photo' },
  ...['mozjpeg', 'webp', 'avif', 'oxipng'].map((format) => ({
    name: `png-alpha-${format}`,
    width: 320,
    height: 240,
    mime: 'image/png',
    kind: 'alpha',
    format,
  })),
  { name: 'png-screenshot', width: 3840, height: 2160, mime: 'image/png', kind: 'screenshot' },
  {
    name: 'webp-static',
    width: 2400,
    height: 1600,
    mime: 'image/webp',
    kind: 'photo',
    format: 'webp',
  },
  ...[1, 3, 6, 8].map((orientation) => ({
    name: `exif-${orientation}`,
    width: 320,
    height: 240,
    mime: 'image/jpeg',
    kind: 'orientation',
    orientation,
  })),
  ...['contain', 'cover', 'stretch', 'percentage'].map((resize) => ({
    name: `resize-${resize}`,
    width: 2400,
    height: 1600,
    mime: 'image/jpeg',
    kind: 'photo',
    resize,
  })),
  ...[
    [1, 1, 'tiny'],
    [16000, 32, 'wide'],
    [32, 16000, 'tall'],
  ].map(([width, height, name]) => ({ name, width, height, mime: 'image/jpeg', kind: 'photo' })),
];
const report = {
  schemaVersion: 1,
  date: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  node: process.version,
  engine,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  systemMemoryBytes: totalmem(),
  repeats,
  cases: [],
};
try {
  browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(process.env.PICFORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  report.browserVersion = browser.version();
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => !!window.baseline);
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
    crossOriginIsolated,
    longTasks: PerformanceObserver.supportedEntryTypes.includes('longtask'),
  }));
  report.encoderDefaults = await page.evaluate(() => window.baseline.defaults);
  report.animation = await page.evaluate(() => window.baseline.animationProbe());
  for (const spec of cases) {
    const result = await page.evaluate(
      async ({ spec, repeats }) => window.baseline.run(spec, repeats),
      { spec, repeats },
    );
    report.cases.push(result);
    await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(
      `${spec.name}: ${result.status}${result.samples.length ? ` (${result.samples[1].totalMs.toFixed(1)} ms warm)` : ''}`,
    );
  }
  assert.equal(report.cases.length, 22);
  assert.equal(report.cases.find((c) => c.name === 'jpeg-60mp').status, 'rejected');
  for (const [name, dimensions] of Object.entries({
    contain: [1620, 1080],
    cover: [1920, 1080],
    stretch: [1920, 1080],
    percentage: [1200, 800],
  })) {
    const sample = report.cases.find((c) => c.name === `resize-${name}`).samples[0];
    assert.deepEqual([sample.width, sample.height], dimensions);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: corpus, dimensions, orientation, alpha, transfer; results: ${output}`);
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.httpServer.close(resolveClosed));
}
