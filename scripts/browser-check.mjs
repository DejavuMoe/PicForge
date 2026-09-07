import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.PICFORGE_BROWSER || 'chromium';
const output =
  process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-browser-')));
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    'packages/app/node_modules/vite/bin/vite.js',
    'preview',
    'packages/app',
    '--port',
    '4187',
    '--strictPort',
  ],
  { stdio: 'pipe' },
);
let browser;
try {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
    server.stdout.on('data', (data) => {
      if (data.toString().includes('4187')) {
        clearTimeout(timeout);
        resolveReady();
      }
    });
    server.once('error', reject);
    server.once('exit', () => reject(new Error('Preview server exited')));
  });
  browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(process.env.PICFORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') console.log('BROWSER ERROR', message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('http://127.0.0.1:4187');
  const panel = page.locator('.pf-tool-panel:not([hidden])');
  const waitDone = () =>
    page.waitForFunction(
      () => {
        const root = document.querySelector('.pf-tool-panel:not([hidden])');
        const error = root.querySelector('.pf-motion-error');
        if (error) throw new Error(error.textContent);
        return root.textContent.includes('Completed');
      },
      null,
      { timeout: 300000 },
    );
  const download = async (name, filename) => {
    const waiting = page.waitForEvent('download');
    await panel.getByRole('button', { name }).click();
    await (await waiting).saveAs(resolve(output, filename));
  };
  const sampleAndroid = process.env.PICFORGE_SAMPLE_ANDROID;
  const sampleIosHeic = process.env.PICFORGE_SAMPLE_IOS_HEIC;
  const sampleIosMov = process.env.PICFORGE_SAMPLE_IOS_MOV;
  // Always exercise the production compressor/PWA, even without private media fixtures.
  const synthetic = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 320, 240);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const staticFile = {
    name: 'baseline.png',
    mimeType: 'image/png',
    buffer: Buffer.from(synthetic, 'base64'),
  };
  const compressStatic = async () => {
    await page
      .locator('.pf-tool-nav')
      .getByRole('button', { name: 'Image compression', exact: true })
      .click();
    await panel.locator('input[type=file]').setInputFiles(staticFile);
    const button = page.getByRole('button', {
      name: 'Download the currently previewed image',
      exact: true,
    });
    await page.waitForFunction(
      () => {
        const button = document.querySelector(
          '[aria-label="Download the currently previewed image"]',
        );
        return button && !button.disabled;
      },
      null,
      { timeout: 60000 },
    );
    const waiting = page.waitForEvent('download');
    await button.click();
    await (await waiting).saveAs(resolve(output, 'static.jpg'));
    const bytes = await readFile(resolve(output, 'static.jpg'));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.deepEqual(
      await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${base64}`;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, bytes.toString('base64')),
      [320, 240],
    );
  };
  await compressStatic();
  await page.screenshot({ path: resolve(output, 'static-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(output, 'static-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (engine === 'chromium') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await compressStatic();
    await context.setOffline(false);
    console.log(
      'PASS: production static compression, download dimensions, mobile width, offline reload/re-encode',
    );
  } else {
    console.log('PASS: production static compression, download dimensions, mobile width');
  }
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'PicForge', exact: true }).click();
  if (
    !sampleAndroid ||
    !sampleIosHeic ||
    !sampleIosMov ||
    !existsSync(sampleAndroid) ||
    !existsSync(sampleIosHeic) ||
    !existsSync(sampleIosMov)
  ) {
    console.log('Sample fixtures omitted; skipping browser sample regression checks.');
    await browser.close();
    server.kill();
    process.exit(0);
  }
  await page
    .locator('.pf-tool-nav')
    .getByRole('button', { name: 'Android Motion Photos', exact: true })
    .click();
  await panel.locator('input[type=file]').setInputFiles(sampleAndroid);
  await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
  await waitDone();
  await download(/^JPG ·/, 'android.jpg');
  await download(/^MP4 ·/, 'android.mp4');
  assert.deepEqual(
    Buffer.concat([
      await readFile(resolve(output, 'android.jpg')),
      await readFile(resolve(output, 'android.mp4')),
    ]),
    await readFile(sampleAndroid),
  );
  assert(!requests.some((url) => /ffmpeg|heif-/.test(url)), 'Android must not load Apple engines');
  await page.getByRole('button', { name: 'PicForge', exact: true }).click();
  await page
    .locator('.pf-tool-nav')
    .getByRole('button', { name: 'iOS Live Photos', exact: true })
    .click();
  const originals = [sampleIosHeic, sampleIosMov];
  await panel.locator('input[type=file]').setInputFiles(originals);
  await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await panel.getByText('Cancelled. You can retry this item.', { exact: true }).waitFor();
  const started = Date.now();
  await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
  await waitDone();
  console.log(`${engine}: iOS pair ${Date.now() - started} ms`);
  await download(/^JPG ·/, 'ios.jpg');
  await download(/^MP4 ·/, 'ios.mp4');
  await download('Download ZIP', 'ios.zip');
  const require = createRequire(new URL('../packages/app/package.json', import.meta.url));
  const zip = await require('jszip').loadAsync(await readFile(resolve(output, 'ios.zip')));
  assert(zip.file('picforge-manifest.json'));
  const iosBase = sampleIosHeic.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  for (const extension of ['jpg', 'mp4']) {
    const member = zip.file(`001-${iosBase}/${iosBase}.${extension}`);
    assert(member);
    assert.deepEqual(
      await member.async('nodebuffer'),
      await readFile(resolve(output, `ios.${extension}`)),
    );
  }
  await page.waitForFunction(() => {
    const root = document.querySelector('.pf-tool-panel:not([hidden])');
    return (
      root.querySelector('.pf-motion-preview-note') || root.querySelector('video')?.readyState >= 1
    );
  });
  if (await panel.locator('.pf-motion-preview-note').count()) {
    assert.notEqual(engine, 'chromium', 'Chromium sample preview must play');
    console.log('Native preview unsupported; static fallback and downloads available');
  } else {
    await panel.locator('video').evaluate(async (video) => {
      await video.play();
      video.pause();
    });
  }
  const probe = (path, extra = []) =>
    JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', ...extra, '-show_streams', '-of', 'json', path], {
        encoding: 'utf8',
      }),
    );
  const video = probe(resolve(output, 'ios.mp4')).streams;
  const primary = video.find((stream) => stream.codec_type === 'video');
  assert.equal(primary.codec_name, 'h264');
  assert.equal(primary.width, 1308);
  assert.equal(primary.height, 1744);
  assert.equal(primary.nb_frames, '49');
  assert(!primary.side_data_list?.some((side) => side.rotation));
  assert.equal(video.find((stream) => stream.codec_type === 'audio').codec_name, 'aac');
  const pts = (path) =>
    JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'packet=pts_time',
          '-of',
          'json',
          path,
        ],
        { encoding: 'utf8' },
      ),
    )
      .packets.map((packet) => Number(packet.pts_time))
      .sort((a, b) => a - b);
  assert.deepEqual(pts(resolve(output, 'ios.mp4')), pts(originals[1]));
  assert(
    Math.abs(Number(primary.duration) - 1.666667) < 0.034,
    'VFR duration within one final-frame interval',
  );
  const still = probe(resolve(output, 'ios.jpg')).streams[0];
  assert.equal(still.width, 4284);
  assert.equal(still.height, 5712);
  await panel.locator('.pf-motion-workspace').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: resolve(output, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(output, 'mobile.png') });
  if (engine === 'chromium') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();

    await page
      .locator('.pf-tool-nav')
      .getByRole('button', { name: 'iOS Live Photos', exact: true })
      .click();
    await panel.locator('input[type=file]').setInputFiles(originals);
    await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
    await waitDone();
    console.log('Offline reload and conversion passed');
  }
  await context.setOffline(false);
  await page.getByRole('button', { name: 'PicForge', exact: true }).click();
  await page
    .locator('.pf-tool-nav')
    .getByRole('button', { name: 'Image compression', exact: true })
    .click();
  await panel.locator('input[type=file]').setInputFiles(resolve(output, 'ios.jpg'));
  await page.waitForFunction(
    () => {
      const button = document.querySelector(
        '[data-testid=status-bar] button[aria-label="Download the currently previewed image"]',
      );
      return button && !button.disabled;
    },
    null,
    { timeout: 60000 },
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: extraction, pairing, cancellation/retry, conversion, timestamps, downloads, responsive layout. Artifacts: ${output}`,
  );
} finally {
  await browser?.close();
  server.kill();
}
