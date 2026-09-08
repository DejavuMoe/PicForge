// Lightweight workbench QA. Start pnpm dev first; no HEIC/MOV conversion here.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const output = process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-ui-')));
await mkdir(output, { recursive: true });
const origin = process.env.PICFORGE_UI_URL || 'http://127.0.0.1:5173';
const groups = new Set((process.env.PICFORGE_UI_GROUPS || 'layout,interaction').split(','));
const run = (group) => groups.has(group) || groups.has('all');
const browser = await chromium.launch();
const report = { browser: browser.version(), groups: [...groups], layouts: [], interactions: [] };
try {
  const page = await browser.newPage({
    reducedMotion: 'reduce',
    locale: 'en-US',
    viewport: { width: 1536, height: 1024 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const active = () => page.locator('.pf-tool-panel:not([hidden])');
  const openTool = async (name) => {
    const picker = page.locator('.pf-mobile-tool .pf-select');
    if (await picker.isVisible()) {
      await picker.click();
      await page.getByRole('option', { name, exact: true }).click();
    } else await page.locator('.pf-tool-nav').getByRole('button', { name, exact: true }).click();
  };
  const capture = async (name) => {
    // Synchronize CSS media queries and React's matchMedia state with a paint,
    // instead of measuring immediately after device-metric emulation changes.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const issues = await page.evaluate(() =>
      [...document.querySelectorAll('button,input,[role=combobox],summary,h1,h2')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width && r.height && (r.left < -1 || r.right > innerWidth + 1);
        })
        .map((e) => ({ text: e.textContent, label: e.getAttribute('aria-label') })),
    );
    assert.deepEqual(issues, [], `${name}: horizontal overflow`);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert(
      !/workbench\.[a-zA-Z]+|\{\{[^}]+\}\}/.test(
        await page.locator('.pf-tool-panel:not([hidden]), .pf-landing').innerText(),
      ),
      `${name}: untranslated UI`,
    );
    await page.screenshot({ path: resolve(output, name + '.png') });
    report.layouts.push(name);
  };
  if (run('entry')) {
    await page.goto(origin);
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.removeItem('picforge.language');
    });
    await page.reload();
    await page.locator('.pf-entry-tool').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('.pf-tool-panel').count(), 0);
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']) {
      await page.goto(`${origin}/?lng=${lang}`);
      await page.locator('.pf-scene-photo img').evaluate((image) => image.decode());
      for (const [width, height] of [
        [1440, 718],
        [856, 718],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        const footer = page.locator('.pf-landing-footer');
        assert.equal(await footer.locator('details, a[href$=".txt"]').count(), 0);
        assert.equal(await footer.locator('.pf-project-links > *').count(), 3);
        await capture(`entry-${lang}-${width}`);
      }
    }
    await page.goto(`${origin}/?lng=en`);
    await page.getByRole('button', { name: 'About PicForge', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'About PicForge');
    await page.locator('.pf-entry-tool').first().focus();
    await page.keyboard.press('Enter');
    await active().locator('.pf-inspector').waitFor();
    await page.goBack();
    await page.locator('.pf-landing').waitFor();
    report.interactions.push(
      'browser language, centered expanded footer, About focus, keyboard entry and history',
    );
  }
  if (run('layout')) {
    const cases = [
      ['light', 'compression', 'en'],
      ['light', 'compression', 'zh-CN'],
      ['light', 'compression', 'zh-TW'],
      ['light', 'compression', 'ja'],
      ['light', 'compression', 'ko'],
      ['light', 'android', 'en'],
      ['dark', 'ios', 'zh-CN'],
    ];
    for (const [theme, tool, lang] of cases) {
      await page.setViewportSize({ width: 1536, height: 1024 });
      await page.goto(`${origin}/?tool=${tool}&lng=${lang}`);
      await page.evaluate((mode) => localStorage.setItem('picforge-color-mode', mode), theme);
      await page.reload();
      await active().locator('.pf-inspector h2').waitFor();
      for (const [width, height] of [
        [1536, 1024],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await capture(`${theme}-${tool}-${lang}-${width}`);
      }
    }
  }
  if (run('interaction')) {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto(`${origin}/?tool=compression&lng=en`);
    await active().locator('.pf-inspector').waitFor();
    const encoded = process.env.PICFORGE_UI_IMAGE
      ? await readFile(process.env.PICFORGE_UI_IMAGE)
      : Buffer.from(
          await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 1536;
            canvas.height = 1024;
            const c = canvas.getContext('2d');
            const g = c.createLinearGradient(0, 0, 1536, 1024);
            g.addColorStop(0, '#224834');
            g.addColorStop(1, '#b4cee0');
            c.fillStyle = g;
            c.fillRect(0, 0, 1536, 1024);
            return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
          }),
          'base64',
        );
    const photo = resolve(output, 'ui-photo.jpg');
    await writeFile(photo, encoded);
    await active()
      .getByTestId('add-file-input')
      .setInputFiles([
        { name: 'first.jpg', mimeType: 'image/jpeg', buffer: encoded },
        { name: 'second.jpg', mimeType: 'image/jpeg', buffer: encoded },
      ]);
    await active().getByText('2 / 2 completed', { exact: true }).waitFor();
    await active().getByRole('button', { name: 'This image', exact: true }).click();
    await active().getByRole('spinbutton', { name: 'Quality value', exact: true }).fill('85');
    await active().getByRole('button', { name: 'All images', exact: true }).click();
    await active().getByRole('spinbutton', { name: 'Quality value', exact: true }).fill('60');
    await active().getByRole('button', { name: 'second.jpg', exact: true }).click();
    assert.equal(
      await active().getByRole('spinbutton', { name: 'Quality value', exact: true }).inputValue(),
      '60',
    );
    await active().getByRole('button', { name: 'first.jpg', exact: true }).click();
    assert.equal(
      await active().getByRole('spinbutton', { name: 'Quality value', exact: true }).inputValue(),
      '85',
    );
    await active().getByRole('button', { name: 'Use global', exact: true }).click();
    await active().getByText('2 / 2 completed', { exact: true }).waitFor();
    report.interactions.push('global/per-image snapshots and explicit restore');
    await active().getByRole('button', { name: 'Clear all', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Shift+Tab');
    assert(await dialog.evaluate((e) => e.contains(document.activeElement)));
    await dialog.press('Escape');
    assert(
      await active()
        .getByRole('button', { name: 'Clear all', exact: true })
        .evaluate((e) => e === document.activeElement),
    );
    const downloaded = page.waitForEvent('download');
    await active().getByRole('button', { name: 'Export completed files', exact: true }).click();
    await (await downloaded).saveAs(resolve(output, 'ui-compression.zip'));
    report.interactions.push('dialog focus/Escape and ZIP download');
    await page.setViewportSize({ width: 390, height: 844 });
    if (await active().getByRole('button', { name: 'first.jpg', exact: true }).isVisible())
      await active().getByRole('button', { name: 'first.jpg', exact: true }).click();
    await active().getByRole('button', { name: 'Slider compare', exact: true }).click();
    await active()
      .getByRole('slider', { name: 'Original / Result', exact: true })
      .press('ArrowRight');
    assert.equal(
      await active()
        .getByRole('slider', { name: 'Original / Result', exact: true })
        .getAttribute('aria-valuenow'),
      '51',
    );
    await capture('loaded-compression-mobile');
    await openTool('Android Motion Photos');
    await active().locator('input[type=file]').waitFor({ state: 'attached' });
    // Structural MP4 is deliberate: verify extraction UI and unsupported-playback fallback,
    // without a video encoder or personal camera fixtures.
    const motion = resolve(output, 'ui-motion.jpg');
    await writeFile(
      motion,
      Buffer.concat([
        encoded,
        Buffer.from([0, 0, 0, 20]),
        Buffer.from('ftypmp42'),
        Buffer.alloc(8),
        Buffer.from([0, 0, 0, 8]),
        Buffer.from('moov'),
        Buffer.from([0, 0, 4, 8]),
        Buffer.from('mdat'),
        Buffer.alloc(1024),
      ]),
    );
    await active().locator('input[type=file]').setInputFiles(motion);
    await active().getByRole('button', { name: 'Extract pending files', exact: true }).click();
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    await active().locator('.pf-motion-row').first().click();
    await active().locator('.pf-motion-preview-note').waitFor();
    assert.equal(await active().getByRole('slider').count(), 0);
    await capture('android-result-mobile');
    await page.setViewportSize({ width: 1536, height: 1024 });
    await capture('android-result-desktop');
    await openTool('iOS Live Photos');
    const preset = active().getByRole('combobox').first();
    await preset.waitFor();
    await preset.press('Enter');
    await preset.press('End');
    await preset.press('Enter');
    assert((await preset.textContent()).includes('Smaller'));
    await preset.press('Enter');
    await preset.press('Escape');
    assert.equal(await preset.getAttribute('aria-expanded'), 'false');
    // Existing JPEG-only path passes bytes through; no HEIC/MOV/FFmpeg conversion.
    await active().locator('input[type=file]').setInputFiles(photo);
    await active().getByRole('button', { name: 'Process batch', exact: true }).click();
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    assert(await preset.isDisabled());
    await capture('ios-jpeg-result-desktop');
    await openTool('Image compression');
    assert.equal(await active().getByTestId('file-row').count(), 2);
    await openTool('Android Motion Photos');
    assert(await active().getByText('1 / 1 completed', { exact: true }).isVisible());
    report.interactions.push(
      'mobile comparison, three-tool queue retention, Android playback fallback and iOS JPEG-only UI',
    );
  }
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile(resolve(output, 'ui-results.json'), JSON.stringify(report, null, 2));
  console.log(
    `PASS: ${report.layouts.length} layout captures; ${report.interactions.length} interaction groups. ${output}`,
  );
} finally {
  await browser.close();
}
