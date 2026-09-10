import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
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
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error);
  });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('http://127.0.0.1:4187');
  await page.locator('.pf-brand-mark').waitFor();
  const brand = await page.evaluate(async () => {
    const content = (selector) => document.querySelector(selector)?.getAttribute('content');
    const localPath = (value) => {
      const url = new URL(value, location.href);
      return url.pathname + url.search;
    };
    const og = content('meta[property="og:image"]');
    const twitter = content('meta[name="twitter:image"]');
    const markSource = document.querySelector('.pf-brand-mark').src;
    const markImage = new Image();
    markImage.src = markSource;
    await markImage.decode();
    const manifest = await (
      await fetch(document.querySelector('link[rel="manifest"]').href)
    ).json();
    const paths = [
      ...new Set([
        ...[...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')].map(
          (link) => localPath(link.href),
        ),
        ...manifest.icons.map((icon) => icon.src),
        ...(markSource.startsWith('data:') ? [] : [localPath(markSource)]),
        localPath(og),
        localPath(twitter),
      ]),
    ];
    const sizes = {};
    let maskableRadius = 0;
    let opaqueMaskable = true;
    for (const path of paths) {
      const image = new Image();
      image.src = path;
      await image.decode().catch(() => {
        throw new Error(`Cannot decode brand asset: ${path}`);
      });
      sizes[path.split('?')[0]] = [image.naturalWidth, image.naturalHeight];
      if (path === '/pwa-maskable-512.png') {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 512, 512).data;
        for (let i = 0; i < data.length; i += 4) {
          opaqueMaskable &&= data[i + 3] === 255;
          if (
            Math.abs(data[i] - 196) + Math.abs(data[i + 1] - 72) + Math.abs(data[i + 2] - 50) >
            15
          ) {
            const pixel = i / 4;
            maskableRadius = Math.max(
              maskableRadius,
              Math.hypot((pixel % 512) + 0.5 - 256, Math.floor(pixel / 512) + 0.5 - 256) / 512,
            );
          }
        }
      }
    }
    return {
      paths,
      sizes,
      og,
      twitter,
      manifest,
      maskableRadius,
      opaqueMaskable,
      markSize: [markImage.naturalWidth, markImage.naturalHeight],
      ogSize: [
        Number(content('meta[property="og:image:width"]')),
        Number(content('meta[property="og:image:height"]')),
      ],
      ogType: content('meta[property="og:image:type"]'),
      card: content('meta[name="twitter:card"]'),
    };
  });
  assert.equal(brand.og, 'https://picforge.de/og-image.png');
  assert.equal(brand.twitter, 'https://picforge.de/twitter-card.png');
  assert.equal(brand.ogType, 'image/png');
  assert.equal(brand.card, 'summary_large_image');
  assert.deepEqual(brand.markSize, [64, 64]);
  assert.deepEqual(brand.ogSize, [1200, 630]);
  assert.deepEqual(brand.sizes['/og-image.png'], brand.ogSize);
  assert.deepEqual(brand.sizes['/twitter-card.png'], [1200, 600]);
  assert.deepEqual(brand.sizes['/apple-touch-icon.png'], [180, 180]);
  assert.deepEqual(brand.sizes['/favicon-32.png'], [32, 32]);
  assert(
    brand.opaqueMaskable && brand.maskableRadius < 0.4,
    'maskable mark stays inside the safe circle',
  );
  for (const icon of brand.manifest.icons) {
    if (icon.sizes !== 'any')
      assert.deepEqual(brand.sizes[icon.src], icon.sizes.split('x').map(Number));
  }
  await writeFile(resolve(output, 'brand-assets.json'), JSON.stringify(brand, null, 2));
  const panel = page.locator('.pf-tool-panel:not([hidden])');
  const openTool = async (name) => {
    await page
      .locator('.pf-entry-tools, .pf-tool-panel:not([hidden]) .pf-inspector')
      .first()
      .waitFor();
    const entry = page
      .locator('.pf-entry-tool')
      .filter({ has: page.getByText(name, { exact: true }) });
    if (await entry.isVisible()) {
      await entry.click();
      return;
    }
    const labels = {
      'Image compression': 'Compress',
      'Android Motion Photos': 'Motion Photo',
      'iOS Live Photos': 'Live Photo',
    };
    const label = labels[name] || name;
    const picker = page.locator('.pf-mobile-tool .pf-select');
    if (await picker.isVisible()) {
      await picker.click();
      await page.getByRole('option', { name: label, exact: true }).click();
    } else
      await page.locator('.pf-tool-nav').getByRole('button', { name: label, exact: true }).click();
  };
  const waitDone = () =>
    page.waitForFunction(
      () => {
        const root = document.querySelector('.pf-tool-panel:not([hidden])');
        const error = root.querySelector('[role=alert]');
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
  let sampleAndroid = process.env.PICFORGE_SAMPLE_ANDROID;
  let sampleIosHeic = process.env.PICFORGE_SAMPLE_IOS_HEIC;
  let sampleIosMov = process.env.PICFORGE_SAMPLE_IOS_MOV;
  const syntheticMedia = process.env.PICFORGE_SYNTHETIC_MEDIA === '1';
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
    await openTool('Image compression');
    await panel.getByTestId('add-file-input').setInputFiles(staticFile);
    const button = page.getByRole('button', {
      name: 'Download this image',
      exact: true,
    });
    await page.waitForFunction(
      () => {
        const button = document.querySelector(
          '.pf-tool-panel:not([hidden]) .pf-inspector-footer button',
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
    const offlineAssets = await page.evaluate(
      async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const response = await fetch(path);
            return { path, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
          }),
        ),
      brand.paths,
    );
    assert(
      offlineAssets.every((asset) => asset.ok && asset.bytes > 0),
      'brand assets remain available offline',
    );
    await compressStatic();
    await context.setOffline(false);
    console.log(
      'PASS: production static compression, download dimensions, mobile width, offline reload/re-encode',
    );
  } else {
    console.log('PASS: production static compression, download dimensions, mobile width');
  }
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'PicForge home', exact: true }).click();
  if (syntheticMedia) {
    // Generate test signals, never use private camera media.
    const png = resolve(output, 'synthetic.png');
    sampleIosHeic = resolve(output, 'synthetic.heic');
    sampleIosMov = resolve(output, 'synthetic.mov');
    sampleAndroid = resolve(output, 'synthetic-motion.jpg');
    const mp4 = resolve(output, 'synthetic.mp4');
    await writeFile(png, staticFile.buffer);
    execFileSync('heif-enc', ['-q', '80', png, '-o', sampleIosHeic], { stdio: 'pipe' });
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x240:rate=10:duration=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:v',
      'libx265',
      '-x265-params',
      'pools=1:frame-threads=1:log-level=error',
      '-tag:v',
      'hvc1',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'pcm_s16le',
      '-shortest',
      sampleIosMov,
    ]);
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      sampleIosMov,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      mp4,
    ]);
    await writeFile(
      sampleAndroid,
      Buffer.concat([await readFile(resolve(output, 'static.jpg')), await readFile(mp4)]),
    );
  }
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
  await openTool('Android Motion Photos');
  await panel.locator('input[type=file]').setInputFiles(sampleAndroid);
  await panel.getByRole('button', { name: 'Extract pending files', exact: true }).click();
  await waitDone();
  await download(/^Download JPG/, 'android.jpg');
  await download(/^Download MP4/, 'android.mp4');
  assert.deepEqual(
    Buffer.concat([
      await readFile(resolve(output, 'android.jpg')),
      await readFile(resolve(output, 'android.mp4')),
    ]),
    await readFile(sampleAndroid),
  );
  assert(!requests.some((url) => /ffmpeg|heif-/.test(url)), 'Android must not load Apple engines');
  await page.getByRole('button', { name: 'PicForge home', exact: true }).click();
  await openTool('iOS Live Photos');
  const originals = [sampleIosHeic, sampleIosMov];
  await panel.locator('input[type=file]').setInputFiles(originals);
  await panel.locator('.pf-motion-row').first().click();
  await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
  await panel.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await panel.getByText('Cancelled. You can retry this item.', { exact: true }).waitFor();
  const started = Date.now();
  await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
  await waitDone();
  console.log(`${engine}: iOS pair ${Date.now() - started} ms`);
  await download(/^Download JPG/, 'ios.jpg');
  await download(/^Download MP4/, 'ios.mp4');
  await download('Download results', 'ios.zip');
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
  const sourcePrimary = probe(originals[1]).streams.find((stream) => stream.codec_type === 'video');
  // Derive the expected display geometry from this input, not a previous private
  // sample. Recent native ffprobe exposes QuickTime clap as Frame Cropping.
  const crop = sourcePrimary.side_data_list?.find(
    (side) => side.side_data_type === 'Frame Cropping',
  );
  let expectedWidth = sourcePrimary.width - (crop?.crop_left ?? 0) - (crop?.crop_right ?? 0);
  let expectedHeight = sourcePrimary.height - (crop?.crop_top ?? 0) - (crop?.crop_bottom ?? 0);
  const rotation =
    sourcePrimary.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? 0;
  assert.equal(Math.abs(rotation) % 90, 0, 'Qualification fixture uses a right-angle rotation');
  if (Math.abs(rotation) % 180 === 90)
    [expectedWidth, expectedHeight] = [expectedHeight, expectedWidth];
  const scale = Math.min(1, 1920 / expectedWidth, 1920 / expectedHeight);
  expectedWidth = Math.floor(Math.round(expectedWidth * scale) / 2) * 2;
  expectedHeight = Math.floor(Math.round(expectedHeight * scale) / 2) * 2;
  assert.equal(primary.codec_name, 'h264');
  assert.equal(primary.width, expectedWidth, 'Source crop/rotation/resize width');
  assert.equal(primary.height, expectedHeight, 'Source crop/rotation/resize height');
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
  const sourcePts = pts(originals[1]);
  assert.equal(primary.nb_frames, String(sourcePts.length), 'Every source frame is retained');
  assert.deepEqual(pts(resolve(output, 'ios.mp4')), sourcePts);
  const finalInterval = sourcePts.length > 1 ? sourcePts.at(-1) - sourcePts.at(-2) : 1 / 30;
  assert(
    Math.abs(Number(primary.duration) - Number(sourcePrimary.duration)) < finalInterval + 1 / 600,
    'VFR duration within one final-frame interval',
  );
  const still = probe(resolve(output, 'ios.jpg')).streams[0];
  const expectedStill = syntheticMedia
    ? [320, 240]
    : execFileSync('magick', ['identify', '-format', '%w %h', `${originals[0]}[0]`], {
        encoding: 'utf8',
      })
        .trim()
        .split(/\s+/)
        .map(Number);
  assert.deepEqual(
    [still.width, still.height],
    expectedStill,
    'Native primary HEIC display dimensions',
  );
  if (syntheticMedia) {
    const rgb = await page.evaluate(
      async (base64) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return [...ctx.getImageData(160, 120, 1, 1).data].slice(0, 3);
      },
      (await readFile(resolve(output, 'ios.jpg'))).toString('base64'),
    );
    assert(
      rgb.every((value, index) => Math.abs(value - [51, 102, 153][index]) < 12),
      'HEIC solid-color fidelity',
    );
  }
  await panel.locator('.pf-workbench').evaluate((element) => {
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

    await openTool('iOS Live Photos');
    await panel.locator('input[type=file]').setInputFiles(originals);
    await panel.locator('.pf-motion-row').first().click();
    await panel.getByRole('button', { name: 'Process batch', exact: true }).click();
    await waitDone();
    console.log('Offline reload and conversion passed');
  }
  await context.setOffline(false);
  await page.getByRole('button', { name: 'PicForge home', exact: true }).click();
  await openTool('Image compression');
  await page.locator('[data-active-tool="compression"]').waitFor();
  if (await panel.locator('.pf-file-row').count()) {
    const clear = panel.getByRole('button', { name: 'Clear all', exact: true });
    if (!(await clear.isVisible()))
      await panel.getByRole('button', { name: 'Back to files', exact: true }).click();
    await clear.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  }
  await panel.getByTestId('add-file-input').setInputFiles(resolve(output, 'ios.jpg'));
  await page.waitForFunction(
    () => {
      const button = document.querySelector(
        '.pf-tool-panel:not([hidden]) .pf-inspector-footer button',
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
