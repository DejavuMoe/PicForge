import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { apng, variableFrames, disposalFrames } from './fixtures.mjs';

const output =
  process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-animation-')));
const browserName = process.env.PICFORGE_BROWSER || 'chromium';
const url = process.env.PICFORGE_QA_URL || 'http://127.0.0.1:5173';
const browser = await { chromium, firefox, webkit }[browserName].launch({
  headless: true,
  ...(process.env.PICFORGE_BROWSER_EXECUTABLE
    ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
    : {}),
});
const report = { browser: browserName, version: browser.version(), url, output, cases: [] };
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
function webpInfo(b) {
  const delays = [];
  let plays, width, height;
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.readUInt32LE(4) + 8, b.length);
  for (let p = 12; p < b.length;) {
    const name = b.toString('ascii', p, p + 4),
      n = b.readUInt32LE(p + 4);
    assert.ok(p + n + 8 <= b.length);
    if (name === 'VP8X') {
      assert.ok(b[p + 8] & 2);
      width = b.readUIntLE(p + 12, 3) + 1;
      height = b.readUIntLE(p + 15, 3) + 1;
    }
    if (name === 'ANIM') plays = b.readUInt16LE(p + 12);
    if (name === 'ANMF') delays.push(b.readUIntLE(p + 20, 3));
    p += n + 8 + (n & 1);
  }
  return { delays, plays, width, height };
}
function reference(frames, width = 16, height = 12) {
  let pixels = Buffer.alloc(width * height * 4);
  const results = [];
  for (const f of frames) {
    const saved = Buffer.from(pixels),
      w = f.width ?? width,
      h = f.height ?? height;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = typeof f.color === 'function' ? f.color(x, y) : f.color;
        const at = ((y + (f.y ?? 0)) * width + x + (f.x ?? 0)) * 4;
        if (f.blend) {
          const sa = c[3] / 255,
            da = pixels[at + 3] / 255,
            a = sa + da * (1 - sa);
          for (let k = 0; k < 3; k++)
            pixels[at + k] = a ? Math.round((c[k] * sa + pixels[at + k] * da * (1 - sa)) / a) : 0;
          pixels[at + 3] = Math.round(a * 255);
        } else pixels.set(c, at);
      }
    results.push(Buffer.from(pixels));
    if (f.dispose === 2) pixels = saved;
    if (f.dispose === 1)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          pixels.fill(
            0,
            ((y + (f.y ?? 0)) * width + x + (f.x ?? 0)) * 4,
            ((y + (f.y ?? 0)) * width + x + (f.x ?? 0)) * 4 + 4,
          );
  }
  return Buffer.concat(results);
}
async function decodeOutput(bytes) {
  // Qualify with the browser's independent native decoder. ImageMagick may lose
  // transparent canvas pixels when the first WebP rectangle is smaller than VP8X.
  return Buffer.from(
    await page.evaluate(async (bytes) => {
      const decoder = new ImageDecoder({ data: new Uint8Array(bytes), type: 'image/webp' });
      try {
        await decoder.tracks.ready;
        const frames = [];
        for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          try {
            const rgba = new Uint8Array(image.allocationSize({ format: 'RGBA' }));
            await image.copyTo(rgba, { format: 'RGBA' });
            frames.push(...rgba);
          } finally {
            image.close();
          }
        }
        return frames;
      } finally {
        decoder.close();
      }
    }, Array.from(bytes)),
  );
}

function comparePixels(actual, expected) {
  assert.equal(actual.length, expected.length);
  let max = 0;
  for (let p = 0; p < actual.length; p += 4) {
    assert.equal(actual[p + 3], expected[p + 3], `alpha at ${p}`);
    if (!expected[p + 3]) continue; // Invisible RGB is not preserved by the app.
    for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(actual[p + c] - expected[p + c]));
  }
  assert.ok(max <= 1, `RGBA mismatch: max visible channel error ${max}`);
  return max;
}
async function convert(bytes, settings = {}) {
  return page.evaluate(
    async ({ bytes, settings }) => {
      const { imageProcessor } = await import('/src/hooks/processingPool.ts');
      const start = performance.now();
      const r = await imageProcessor.process({
        id: crypto.randomUUID(),
        source: new Blob([new Uint8Array(bytes)]),
        settings: { outputFormat: 'webp', quality: 80, advanced: { lossless: 1 }, ...settings },
      });
      return {
        ms: performance.now() - start,
        engine: r.engine,
        width: r.width,
        height: r.height,
        bytes: Array.from(new Uint8Array(r.buffer)),
      };
    },
    { bytes: Array.from(bytes), settings },
  );
}
try {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  for (const [name, frames, poster] of [
    ['variable', variableFrames, false],
    ['disposal', disposalFrames, false],
    ['poster', variableFrames, true],
    [
      'poster-partial',
      variableFrames.map((f, i) => ({ ...f, width: 4, height: 3, x: i * 5, y: i * 3, blend: 1 })),
      true,
    ],
    [
      'poster-rgb',
      variableFrames.map((f, i) => ({ ...f, width: 4, height: 3, x: i * 5, y: i * 3, blend: 1 })),
      true,
    ],
    ['zero-delay', variableFrames.map((f, i) => ({ ...f, delay: i ? f.delay : 0 })), false],
    ['fractional', variableFrames.map((f) => ({ ...f, delay: 1, denominator: 60 })), false],
    ['identical', [variableFrames[0], variableFrames[0]], false],
  ]) {
    const input = apng({ frames, poster, colorType: name === 'poster-rgb' ? 2 : 6 });
    await writeFile(resolve(output, `${name}.apng`), input);
    const r = await convert(input);
    assert.equal(r.engine, 'animation');
    const bytes = Buffer.from(r.bytes),
      info = webpInfo(bytes);
    const expectedDelays =
      name === 'identical'
        ? [140]
        : name === 'fractional'
          ? [17, 16, 17]
          : frames.map((f) => f.delay || 100);
    assert.deepEqual(info, { delays: expectedDelays, plays: 3, width: 16, height: 12 }, name);
    const path = resolve(output, `${name}.webp`);
    await writeFile(path, bytes);
    const pixels = await decodeOutput(bytes);
    const maxPixelError = comparePixels(
      pixels,
      reference(name === 'identical' ? [frames[0]] : frames),
    );
    report.cases.push({ name, ms: r.ms, bytes: bytes.length, ...info, maxPixelError });
  }
  // An independent GIF encoder/decoder exercises palettes, local frames and disposal.
  const gifPath = resolve(output, 'variable.gif');
  execFileSync('magick', [
    '-size',
    '32x24',
    '-delay',
    '7',
    'xc:red',
    '-delay',
    '13',
    'xc:green',
    '-delay',
    '24',
    'xc:blue',
    '-loop',
    '3',
    gifPath,
  ]);
  const gif = await readFile(gifPath),
    r = await convert(gif),
    bytes = Buffer.from(r.bytes);
  assert.deepEqual(webpInfo(bytes), { delays: [70, 130, 240], plays: 3, width: 32, height: 24 });
  const gifOut = resolve(output, 'gif.webp');
  await writeFile(gifOut, bytes);
  comparePixels(
    execFileSync('magick', [gifOut, '-alpha', 'on', '-coalesce', '-depth', '8', 'rgba:-']),
    execFileSync('magick', [gifPath, '-alpha', 'on', '-coalesce', '-depth', '8', 'rgba:-']),
  );
  report.cases.push({ name: 'gif', ms: r.ms, bytes: bytes.length, ...webpInfo(bytes) });
  for (const method of ['contain', 'cover', 'stretch']) {
    const result = await convert(apng({ frames: disposalFrames }), {
      resize: {
        enabled: true,
        mode: 'absolute',
        method,
        maxWidth: 8,
        maxHeight: 8,
        percentage: 50,
      },
    });
    assert.deepEqual([result.width, result.height], method === 'contain' ? [8, 6] : [8, 8]);
    assert.deepEqual(webpInfo(Buffer.from(result.bytes)).delays, [70, 130, 240, 90]);
    report.cases.push({ name: method, ms: result.ms, bytes: result.bytes.length });
  }
  for (const plays of [0, 1, 7]) {
    assert.equal(
      webpInfo(Buffer.from((await convert(apng({ frames: variableFrames, plays }))).bytes)).plays,
      plays,
    );
  }
  const safety = await page.evaluate(async (bytes) => {
    const { imageProcessor } = await import('/src/hooks/processingPool.ts');
    const source = new Blob([new Uint8Array(bytes)]);
    const request = { id: 'safety', source, settings: { outputFormat: 'mozjpeg', quality: 75 } };
    const error = await imageProcessor.process(request).then(
      () => 'unexpected success',
      (e) => e.message,
    );
    const controller = new AbortController();
    controller.abort();
    const cancelled = await imageProcessor.process(request, controller.signal).then(
      () => 'unexpected success',
      (e) => e.name,
    );
    return { error, cancelled };
  }, Array.from(gif));
  assert.deepEqual(safety, { error: 'Animation: format', cancelled: 'AbortError' });
  // Cancel an encoder that is already running, and a job queued behind it.
  const cancelSource = resolve(output, 'cancel.gif');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=20:duration=1',
    '-loop',
    '0',
    cancelSource,
  ]);
  const lifecycle = await page.evaluate(
    async ({ large, small }) => {
      const { imageProcessor } = await import('/src/hooks/processingPool.ts');
      const source = new Blob([new Uint8Array(large)]);
      const activeAbort = new AbortController(),
        queuedAbort = new AbortController();
      let queued,
        armed = false,
        lateProgress = 0;
      const active = await imageProcessor
        .process(
          {
            id: 'active',
            source,
            settings: { outputFormat: 'webp', quality: 80 },
            onProgress: (progress) => {
              if (activeAbort.signal.aborted) lateProgress++;
              if (progress < 10 || armed) return;
              armed = true;
              queued = imageProcessor
                .process(
                  { id: 'queued', source, settings: { outputFormat: 'webp', quality: 80 } },
                  queuedAbort.signal,
                )
                .then(
                  () => 'unexpected result',
                  (e) => e.name,
                );
              setTimeout(() => queuedAbort.abort(), 5);
              setTimeout(() => activeAbort.abort(), 20);
            },
          },
          activeAbort.signal,
        )
        .then(
          () => 'unexpected result',
          (e) => e.name,
        );
      const queuedOutcome = await queued;
      const retry = await imageProcessor.process({
        id: 'retry',
        source: new Blob([new Uint8Array(small)]),
        settings: { outputFormat: 'webp', quality: 80 },
      });
      return { active, queued: queuedOutcome, lateProgress, retry: retry.engine };
    },
    { large: Array.from(await readFile(cancelSource)), small: Array.from(gif) },
  );
  assert.deepEqual(lifecycle, {
    active: 'AbortError',
    queued: 'AbortError',
    lateProgress: 0,
    retry: 'animation',
  });
  report.lifecycle = lifecycle;
  assert.deepEqual(errors, []);
  report.safety = safety;
  await writeFile(resolve(output, `${browserName}-results.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
