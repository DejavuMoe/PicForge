// Run with the Vite dev server. No UI/media tests concurrently with measurements.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = await mkdtemp(resolve(tmpdir(), 'picforge-animation-bench-'));
const inputPath = resolve(output, 'testsrc.gif');
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-t',
  '3',
  '-i',
  'testsrc2=size=640x360:rate=20',
  '-filter_complex',
  'split[a][b];[a]palettegen[p];[b][p]paletteuse',
  '-loop',
  '0',
  inputPath,
]);
const input = await readFile(inputPath);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cases = [];
const base = process.env.PICFORGE_QA_URL || 'http://127.0.0.1:5173';
// Sum of browser-process RSS, NOT unique resident memory (shared pages counted repeatedly).
function rss() {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((x) => x.trim().split(/\s+/).map(Number));
  const ids = new Set([process.pid]);
  let before;
  do {
    before = ids.size;
    for (const [pid, ppid] of rows) if (ids.has(ppid)) ids.add(pid);
  } while (ids.size > before);
  return (
    rows
      .filter(([pid]) => ids.has(pid) && pid !== process.pid)
      .reduce((sum, row) => sum + row[2], 0) / 1024
  );
}
try {
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  for (const engine of ['animation', 'vips']) {
    for (let iteration = 0; iteration < 4; iteration++) {
      const beforeMiB = rss();
      let peakMiB = beforeMiB;
      const timer = setInterval(() => {
        peakMiB = Math.max(peakMiB, rss());
      }, 50);
      let result;
      try {
        result = await page.evaluate(
          async ({ engine, input, probePath }) => {
            const source = new Blob([new Uint8Array(input)]),
              longTasks = [];
            const observer = new PerformanceObserver((list) =>
              longTasks.push(...list.getEntries().map((e) => e.duration)),
            );
            observer.observe({ entryTypes: ['longtask'] });
            const start = performance.now();
            let buffer;
            try {
              if (engine === 'animation') {
                const { imageProcessor } = await import('/src/hooks/processingPool.ts');
                buffer = (
                  await imageProcessor.process({
                    id: 'benchmark',
                    source,
                    settings: { outputFormat: 'webp', quality: 80, advanced: { method: 4 } },
                  })
                ).buffer;
              } else {
                // A real module URL gives Vips pthread Workers the correct base URL.
                const url = new URL('/@fs' + probePath, location.origin);
                buffer = await new Promise((resolve, reject) => {
                  const worker = new Worker(url, { type: 'module' });
                  const timer = setTimeout(() => {
                    worker.terminate();
                    reject(new Error('Vips timed out'));
                  }, 120_000);
                  const finish = () => {
                    clearTimeout(timer);
                    worker.terminate();
                  };
                  worker.onmessage = ({ data }) => {
                    finish();
                    data.error ? reject(new Error(data.error)) : resolve(data.bytes.buffer);
                  };
                  worker.onerror = (e) => {
                    finish();
                    reject(new Error(e.message));
                  };
                  worker.postMessage(new Uint8Array(input));
                });
              }
              return {
                ms: performance.now() - start,
                longTasks,
                bytes: Array.from(new Uint8Array(buffer)),
              };
            } finally {
              observer.disconnect();
            }
          },
          {
            engine,
            input: Array.from(input),
            probePath: fileURLToPath(new URL('./vipsProbe.mjs', import.meta.url)),
          },
        );
      } finally {
        clearInterval(timer);
      }
      const bytes = Buffer.from(result.bytes);
      delete result.bytes;
      await writeFile(resolve(output, `${engine}.webp`), bytes);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      cases.push({
        engine,
        iteration,
        ...result,
        bytes: bytes.length,
        beforeMiB,
        peakMiB,
        afterMiB: rss(),
      });
    }
  }
  const decode = (path) =>
    execFileSync('magick', [path, '-alpha', 'on', '-coalesce', '-depth', '8', 'rgba:-'], {
      maxBuffer: 100e6,
    });
  const reference = decode(inputPath),
    quality = {};
  for (const engine of ['animation', 'vips']) {
    const decoded = decode(resolve(output, `${engine}.webp`));
    assert.equal(decoded.length, reference.length);
    let squaredError = 0;
    for (let i = 0; i < decoded.length; i++)
      if (i % 4 !== 3) squaredError += (decoded[i] - reference[i]) ** 2;
    quality[engine] = {
      rgbPSNR: 10 * Math.log10(255 ** 2 / (squaredError / ((decoded.length * 3) / 4))),
    };
  }
  const report = {
    browser: browser.version(),
    sourceSHA256: createHash('sha256').update(input).digest('hex'),
    note: 'Same input and Q80/effort4, not equal quality. Fresh Worker each task; local HTTP, iteration0 first load. RSS sums shared pages and is affected by allocator/cache retention.',
    cases,
    quality,
  };
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally {
  await browser.close();
}
