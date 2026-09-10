// Lightweight workbench QA. Start pnpm dev first; no HEIC/MOV conversion here.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
const output = process.env.PICFORGE_QA_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-ui-')));
await mkdir(output, { recursive: true });
const origin = process.env.PICFORGE_UI_URL || 'http://127.0.0.1:5173';
const groups = new Set((process.env.PICFORGE_UI_GROUPS || 'layout,interaction').split(','));
const run = (group) => groups.has(group) || groups.has('all');
const engines = { chromium, firefox, webkit };
const engine = process.env.PICFORGE_UI_BROWSER || 'chromium';
assert(engines[engine], `Unknown browser: ${engine}`);
const browser = await engines[engine].launch({
  ...(process.env.PICFORGE_UI_EXECUTABLE
    ? { executablePath: process.env.PICFORGE_UI_EXECUTABLE }
    : {}),
});
const report = {
  engine,
  browser: browser.version(),
  groups: [...groups],
  layouts: [],
  interactions: [],
};
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
  const choose = async (control, value) => {
    if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
    const option =
      typeof value === 'object'
        ? page.getByRole('option', { name: value.label, exact: true })
        : page.locator(`[role="option"][data-value="${value}"]`);
    await option.click();
  };
  const openTool = async (name) => {
    const picker = page.locator('.pf-mobile-tool .pf-select');
    if (await picker.isVisible()) {
      await choose(picker, { label: name });
    } else await page.locator('.pf-tool-nav').getByRole('button', { name, exact: true }).click();
  };
  const settleLayout = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  const checkRanges = async () => {
    for (const field of await active().locator('.pf-range-field:visible').all()) {
      const values = await field.locator('input').evaluateAll((elements) =>
        elements.map((el) => ({
          box: el.getBoundingClientRect().toJSON(),
          background: getComputedStyle(el).backgroundColor,
          disabled: el.matches(':disabled'),
        })),
      );
      assert.equal(values.length, 2);
      assert(Math.abs(values[0].box.height - values[1].box.height) < 0.5, 'range/number height');
      assert(Math.abs(values[0].box.y - values[1].box.y) < 0.5, 'range/number top');
      assert.equal(values[0].disabled, values[1].disabled, 'range/number disabled state');
      assert.equal(values[0].background, 'rgba(0, 0, 0, 0)', 'range has no input-box background');
    }
  };
  const capture = async (name) => {
    // Wait for responsive media queries to reach the next painted layout.
    await settleLayout();
    const issues = await page.evaluate(() =>
      [...document.querySelectorAll('button,input,select,[role=combobox],summary,h1,h2')]
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
      await page
        .locator('.pf-demo-image img')
        .first()
        .evaluate((image) => image.decode());
      for (const [width, height] of [
        [1440, 718],
        [856, 718],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        const footer = page.locator('.pf-site-footer');
        assert.equal(await footer.locator('details, a[href$=".txt"]').count(), 0);
        assert.equal(await footer.locator('a').count(), 2);
        await capture(`entry-${lang}-${width}`);
      }
    }
    await page.goto(`${origin}/?lng=en`);
    assert.equal(
      await page.getByRole('button', { name: 'About PicForge', exact: true }).count(),
      0,
    );
    await page.locator('.pf-entry-tool').first().focus();
    await page.keyboard.press('Enter');
    await active().locator('.pf-inspector').waitFor();
    await page.goBack();
    await page.locator('.pf-landing').waitFor();
    report.interactions.push(
      'browser language, centered footer without About, keyboard entry and history',
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
    await active().getByRole('button', { name: 'Download results', exact: true }).click();
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
    await openTool('Motion Photo');
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
    await openTool('Live Photo');
    const preset = active().getByRole('combobox').first();
    await preset.waitFor();
    await choose(preset, 'compact');
    assert.equal(await preset.getAttribute('data-value'), 'compact');
    // Existing JPEG-only path passes bytes through; no HEIC/MOV/FFmpeg conversion.
    await active().locator('input[type=file]').setInputFiles(photo);
    await active().getByRole('button', { name: 'Process batch', exact: true }).click();
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    assert(await preset.isDisabled());
    await capture('ios-jpeg-result-desktop');
    await openTool('Compress');
    assert.equal(await active().getByTestId('file-row').count(), 2);
    await openTool('Motion Photo');
    assert(await active().getByText('1 / 1 completed', { exact: true }).isVisible());
    report.interactions.push(
      'mobile comparison, three-tool queue retention, Android playback fallback and iOS JPEG-only UI',
    );
  }
  if (run('usability')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/?lng=en`);
    await page.evaluate(() => localStorage.setItem('picforge-color-mode', 'light'));
    await page.reload();
    const sampleSlider = page.getByRole('slider', { name: 'Compare the JPEG and WebP sample' });
    await sampleSlider.press('ArrowRight');
    assert.equal(await sampleSlider.inputValue(), '51');
    await page.getByRole('button', { name: 'Try sample', exact: true }).click();
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    assert.equal(
      await active().getByRole('button', { name: 'dune-sample.jpg', exact: true }).count(),
      1,
    );
    const format = active().getByRole('combobox', { name: 'Format', exact: true });
    await choose(format, 'webp');
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    const quality = active().getByRole('spinbutton', { name: 'Quality value', exact: true });
    await quality.fill('');
    assert.equal(await quality.inputValue(), '', 'numeric drafts can be cleared');
    await quality.press('Tab');
    assert.equal(await quality.inputValue(), '75', 'empty draft restores prior value');
    await quality.fill('92');
    await quality.press('Escape');
    assert.equal(await quality.inputValue(), '75', 'Escape cancels numeric draft');
    assert(
      await quality.evaluate((input) => input === document.activeElement),
      'Escape retains input focus',
    );
    await active().getByRole('switch', { name: 'Resize', exact: true }).click();
    const width = active().getByRole('spinbutton', { name: 'Width', exact: true });
    await width.fill('9');
    await width.pressSequentially('60');
    assert.equal(await width.inputValue(), '960');
    await width.press('Enter');
    assert(
      await width.evaluate((input) => input === document.activeElement),
      'Enter retains input focus',
    );
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    assert((await active().locator('.pf-preview-file-facts').innerText()).includes('960×640'));
    await choose(format, 'oxipng');
    assert(await quality.isDisabled(), 'lossless PNG has no ineffective quality input');
    await choose(format, 'webp');
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    await active().getByRole('button', { name: 'Slider compare', exact: true }).click();
    const full = active().getByRole('button', { name: 'Toggle fullscreen', exact: true });
    if (await full.isEnabled()) {
      await full.click();
      await page.waitForFunction(() =>
        document.fullscreenElement?.classList.contains('pf-preview'),
      );
      assert(await active().getByRole('combobox', { name: 'Zoom level' }).isVisible());
      await choose(active().getByRole('combobox', { name: 'Zoom level' }), '2');
      assert.equal(
        await active().locator('.pf-preview-viewport').getAttribute('data-zoomed'),
        'true',
      );
      await full.click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await choose(active().getByRole('combobox', { name: 'Zoom level' }), '1');
    }
    const fieldBounds = await format.boundingBox();
    const downloadBounds = await active().locator('.pf-download-current').boundingBox();
    assert(
      Math.abs(fieldBounds.x - downloadBounds.x) < 0.5 &&
        Math.abs(fieldBounds.width - downloadBounds.width) < 0.5,
      'inspector fields and fixed download footer share edges',
    );
    await capture('delivery-compression-light-desktop');
    await page.getByRole('button', { name: 'Toggle color mode', exact: true }).click();
    await capture('delivery-compression-dark-desktop');
    for (const size of [320, 390]) {
      await page.setViewportSize({ width: size, height: 844 });
      await capture(`delivery-compression-mobile-${size}`);
      const controls = await active()
        .locator('.pf-preview-controls button')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        );
      assert(
        controls.every((r) => r.width >= 44 && r.height >= 44),
        'mobile preview targets are at least 44px',
      );
    }
    await page.getByRole('button', { name: 'PicForge home', exact: true }).click();
    await page.locator('.pf-entry-tool').first().waitFor();
    const bounds = await page.locator('.pf-entry-tools').boundingBox();
    assert(bounds.y + bounds.height < 844, 'all mobile tool entries are in the first viewport');
    await capture('delivery-home-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture('delivery-home-dark-desktop');
    await page.getByRole('button', { name: 'Toggle color mode', exact: true }).click();
    await capture('delivery-home-light-desktop');
    assert.equal(await page.locator('.pf-optical-layer, canvas').count(), 0);
    report.interactions.push(
      'sample to real compression, numeric drafts/Enter/Escape, resize geometry, PNG guidance, fullscreen controls, 320px touch targets',
    );

    const restricted = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'ja-JP',
      colorScheme: 'dark',
    });
    await restricted.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Storage blocked', 'SecurityError');
        },
      }),
    );
    const restrictedPage = await restricted.newPage();
    const restrictedErrors = [];
    restrictedPage.on('pageerror', (error) => restrictedErrors.push(error.message));
    await restrictedPage.goto(origin);
    await restrictedPage.locator('.pf-entry-tool').first().waitFor();
    assert.equal(await restrictedPage.locator('html').getAttribute('lang'), 'ja');
    const initialScheme = await restrictedPage.evaluate(() =>
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    );
    assert.equal(await restrictedPage.locator('html').getAttribute('data-pf-theme'), initialScheme);
    await restrictedPage.emulateMedia({ colorScheme: 'dark' });
    await restrictedPage.waitForFunction(() => document.documentElement.dataset.pfTheme === 'dark');
    await restrictedPage.emulateMedia({ colorScheme: 'light' });
    await restrictedPage.waitForFunction(
      () => document.documentElement.dataset.pfTheme === 'light',
    );
    assert.deepEqual(restrictedErrors, []);
    await restricted.close();
    report.interactions.push('blocked storage remains usable; automatic language and system theme');
  }
  if (run('details')) {
    let columnDrift = 0;
    let disclosureDrift = 0;
    const same = (values, name) => {
      const drift = Math.max(...values) - Math.min(...values);
      assert(drift < 0.5, `${name}: ${drift}px drift (${values.join(', ')})`);
      return drift;
    };
    await page.goto(origin);
    await page.evaluate(() => localStorage.removeItem('picforge.language'));
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']) {
      await page.goto(`${origin}/?lng=${lang}`);
      await page.locator('.pf-entry-tool').first().waitFor();
      for (const [width, height] of [
        [1160, 571],
        [1576, 828],
        [856, 718],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await settleLayout();
        const insets = await page.locator('.pf-entry-tool').evaluateAll((elements) =>
          elements.map((row) => {
            const box = row.getBoundingClientRect();
            return [
              row.firstElementChild.getBoundingClientRect().left - box.left,
              box.right - row.lastElementChild.getBoundingClientRect().right,
            ];
          }),
        );
        for (const [left, right] of insets) {
          assert(left >= 12 && right >= 12, 'home rows have space at both ends');
          same([left, right], 'home row left/right inset');
        }
        const rows = await page.locator('.pf-entry-tool').evaluateAll((elements) =>
          elements.map((row) =>
            [...row.children].map((child) => {
              const r = child.getBoundingClientRect();
              return { x: r.x, width: r.width };
            }),
          ),
        );
        for (let column = 0; column < 5; column++) {
          const visible = rows.map((row) => row[column]).filter((rect) => rect.width > 0);
          if (visible.length)
            columnDrift = Math.max(
              columnDrift,
              same(
                visible.map((rect) => rect.x),
                `${lang}/${width} home column ${column}`,
              ),
            );
        }
      }
    }
    await page.setViewportSize({ width: 1160, height: 571 });
    await page.goto(`${origin}/?lng=zh-CN`);
    await page.locator('.pf-landing').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await capture('audit-home-alignment');
    const language = page.locator('.pf-language-control .pf-select');
    assert.equal((await language.innerText()).trim(), '简体中文');
    const headerWidth = (await language.boundingBox()).width;
    await language.click();
    assert.equal(await page.getByRole('option').count(), 5);
    assert(!/自动|Automatic|Browser language/.test(await page.getByRole('listbox').innerText()));
    await page.getByRole('option', { name: '简体中文', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('picforge.language')), 'zh-CN');
    await choose(language, 'en');
    assert.equal(await page.evaluate(() => localStorage.getItem('picforge.language')), 'en');
    same([headerWidth, (await language.boundingBox()).width], 'language control width');
    await page.reload();
    await language.waitFor();
    assert.equal((await language.innerText()).trim(), 'English');
    assert.equal(await language.getAttribute('data-value'), 'en');
    report.interactions.push(
      'shared home columns across five locales/four widths; five language choices with explicit persistence and no automatic option',
    );

    await page.goto(`${origin}/?tool=compression&lng=en`);
    await active().locator('.pf-inspector').waitFor();
    const format = active().getByRole('combobox', { name: 'Format', exact: true });
    const disclosure = active().locator('.pf-settings-fields > details > summary');
    const presets = active().locator('.pf-inspector-body > details > summary');
    for (const [width, height] of [
      [1160, 571],
      [1576, 828],
      [856, 718],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await settleLayout();
      const widths = [];
      for (let toggle = 0; toggle < 4; toggle++) {
        widths.push((await format.boundingBox()).width);
        await disclosure.click();
        await presets.click();
      }
      disclosureDrift = Math.max(disclosureDrift, same(widths, `${width} inspector toggle width`));
    }
    await page.setViewportSize({ width: 1576, height: 828 });
    const controlStyle = () =>
      format.evaluate((element) => {
        const style = getComputedStyle(element),
          r = element.getBoundingClientRect();
        return {
          x: r.x,
          width: r.width,
          height: r.height,
          background: style.backgroundColor,
          appearance: style.appearance,
          arrow: style.backgroundImage,
        };
      });
    const hoverCapable = await page.evaluate(
      () => matchMedia('(hover: hover) and (pointer: fine)').matches,
    );
    for (const mode of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-pf-theme')) !== mode)
        await page.getByRole('button', { name: 'Toggle color mode', exact: true }).click();
      await page.locator('.pf-brand-button').hover();
      await settleLayout();
      const normal = await controlStyle();
      await format.hover();
      await settleLayout();
      const hover = await controlStyle();
      assert.equal(normal.appearance, 'none');
      assert.equal(await format.locator('svg').count(), 1);
      if (hoverCapable)
        assert.notEqual(
          normal.background,
          hover.background,
          'pointer select has a deliberate hover surface',
        );
      else
        assert.equal(
          normal.background,
          hover.background,
          'non-hover input avoids sticky hover decoration',
        );
      same([normal.width, hover.width], 'select hover width');
      same([normal.height, hover.height], 'select hover height');
      await format.press('Tab');
      await page.keyboard.press('Tab');
      const quality = active().getByRole('spinbutton', { name: 'Quality value', exact: true });
      assert(await quality.evaluate((input) => input === document.activeElement));
      assert.equal(
        await quality.evaluate((input) => getComputedStyle(input).outlineStyle),
        'solid',
      );
      await quality.fill('83');
      await quality.press('Enter');
      assert(await quality.evaluate((input) => input === document.activeElement));
      await quality.fill('91');
      await quality.press('Escape');
      assert.equal(await quality.inputValue(), '83');
      assert(await quality.evaluate((input) => input === document.activeElement));
      await capture(`audit-controls-${mode}`);
    }
    report.interactions.push(
      'advanced/preset disclosures keep width across desktop/tablet/phone; select hover geometry and numeric Enter/Escape focus',
    );
    report.detailMeasurements = { columnDrift, disclosureDrift, hoverCapable };
  }
  if (run('controls')) {
    await page.goto(origin);
    await page.evaluate(() => localStorage.removeItem('picforge.language'));
    for (const tool of ['home', 'compression', 'android', 'ios']) {
      for (const [width, height] of [
        [1576, 828],
        [1160, 571],
        [390, 844],
        [320, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${origin}/?tool=${tool}&lng=zh-CN`);
        await page
          .locator(
            tool === 'home' ? '.pf-entry-tool' : '.pf-tool-panel:not([hidden]) .pf-inspector',
          )
          .first()
          .waitFor();
        await settleLayout();
        assert.equal(await page.locator('select').count(), 0, 'no system select menus');
        assert.equal(await page.locator('[title]').count(), 0, 'no system tooltips');
        assert.equal(await page.locator('.pf-header .pf-github-link').count(), 1);
        assert(await page.locator('.pf-header .pf-github-link').isVisible());
        assert.equal(await page.locator('.pf-site-footer a').count(), 2);
        assert.equal(await page.locator('.pf-site-footer a[href*=github]').count(), 0);
        const copyright = await page.locator('.pf-copyright').boundingBox();
        const sponsor = await page.locator('.pf-project-sponsor').boundingBox();
        assert(sponsor.y + sponsor.height <= height + 1, 'sponsor stays visible');
        if (width >= 768) {
          assert(Math.abs(copyright.y - sponsor.y) < 1);
          assert(copyright.x <= 25 && sponsor.x + sponsor.width >= width - 25);
        } else {
          assert(copyright.y + copyright.height <= sponsor.y + 1);
          assert(Math.abs(copyright.x + copyright.width / 2 - width / 2) < 1);
          assert(Math.abs(sponsor.x + sponsor.width / 2 - width / 2) < 1);
        }
        for (const control of await page.locator('.pf-select').all()) {
          if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
          await control.click();
          const list = page.getByRole('listbox');
          await list.waitFor();
          const bounds = await list.boundingBox();
          assert(
            bounds.x >= 0 &&
              bounds.x + bounds.width <= width + 1 &&
              bounds.y >= 0 &&
              bounds.y + bounds.height <= height + 1,
            'popup stays in viewport',
          );
          assert(!/自动选择|自动選択|Automatic|跟随浏览器/.test(await list.innerText()));
          assert.equal(
            await control.evaluate((el) => getComputedStyle(el).outlineStyle),
            'none',
            'pointer opens without focus ring',
          );
          await list.getByRole('option', { selected: true }).click();
          await page.locator('.pf-site-footer').hover();
          await settleLayout();
          assert.equal(await control.getAttribute('aria-expanded'), 'false');
          assert.equal(
            await control.evaluate((el) => getComputedStyle(el).outlineStyle),
            'none',
            'pointer selection leaves no ring',
          );
        }
        if (width === 1576 || width === 390) await capture(`controls-${tool}-${width}`);
      }
    }
    await page.setViewportSize({ width: 1160, height: 571 });
    await page.goto(`${origin}/?tool=compression&lng=en`);
    const format = active().getByRole('combobox', { name: 'Format', exact: true });
    await format.press('Enter');
    assert.equal(await page.getByRole('listbox').count(), 1);
    await format.press('ArrowDown');
    await format.press('Enter');
    assert.equal(await format.getAttribute('data-value'), 'webp');
    assert(await format.evaluate((el) => el === document.activeElement));
    assert.equal(await format.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');
    await format.press('Enter');
    await format.press('Escape');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await format.click();
    await page.getByRole('listbox').waitFor();
    await capture('controls-open-format-menu');
    await page.setViewportSize({ width: 1170, height: 580 });
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('listbox').count(), 0, 'resize dismisses stale popup');
    await page.goto(`${origin}/?lng=en`);
    const slider = page.getByRole('slider', { name: 'Compare the JPEG and WebP sample' });
    await slider.click();
    await page.locator('.pf-brand-button').hover();
    const handle = page.locator('.pf-demo-divider > span');
    assert.equal(await handle.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(
      await page.locator('.pf-demo-image').evaluate((el) => getComputedStyle(el).outlineStyle),
      'none',
    );
    await slider.press('ArrowRight');
    assert.equal(await handle.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');
    assert.equal(
      await page.locator('.pf-demo-image').evaluate((el) => getComputedStyle(el).outlineStyle),
      'none',
    );
    const hoverCapable = await page.evaluate(
      () => matchMedia('(hover: hover) and (pointer: fine)').matches,
    );
    if (hoverCapable) {
      await page.getByRole('link', { name: 'GitHub', exact: true }).hover();
      await page.getByRole('tooltip').waitFor();
      assert.equal(await page.getByRole('tooltip').innerText(), 'GitHub');
    }
    report.interactions.push(
      'all routes: themed popups, no automatic language option, header GitHub and responsive sponsor/copyright footer; pointer/keyboard focus and custom hints',
    );
  }
  if (run('video')) {
    assert(process.env.PICFORGE_UI_VIDEO, 'Set PICFORGE_UI_VIDEO to a synthetic MP4');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/?tool=android&lng=en`);
    await active().locator('input[type=file]').waitFor({ state: 'attached' });
    const fixture = Buffer.concat([
      await readFile('packages/app/src/assets/dune-sample.jpg'),
      await readFile(process.env.PICFORGE_UI_VIDEO),
    ]);
    await active()
      .locator('input[type=file]')
      .setInputFiles({ name: 'playback.jpg', mimeType: 'image/jpeg', buffer: fixture });
    await active().getByRole('button', { name: 'Extract pending files', exact: true }).click();
    await active().getByText('1 / 1 completed', { exact: true }).waitFor();
    const video = active().locator('video');
    await video.waitFor();
    assert.equal(await video.getAttribute('controls'), null);
    await page.waitForFunction(
      () =>
        document.querySelector('video')?.duration > 0 ||
        document.querySelector('.pf-motion-preview-note'),
    );
    if (await active().locator('.pf-motion-preview-note').isVisible()) {
      const waiting = page.waitForEvent('download');
      await active().getByRole('button', { name: 'Download MP4', exact: true }).click();
      const destination = resolve(output, 'preview-fallback.mp4');
      await (await waiting).saveAs(destination);
      assert.deepEqual(await readFile(destination), await readFile(process.env.PICFORGE_UI_VIDEO));
      await capture('controls-video-fallback');
      report.interactions.push(
        'synthetic video: explicit unsupported-preview fallback with byte-identical MP4 download',
      );
    } else {
      await active().getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
      await active().getByRole('button', { name: 'Pause', exact: true }).click();
      assert(await video.evaluate((el) => el.paused));
      await active().getByRole('button', { name: 'Mute preview', exact: true }).click();
      assert(await video.evaluate((el) => el.muted));
      await active().getByRole('slider', { name: 'Playback position', exact: true }).press('End');
      await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 1.8);
      await active().getByRole('slider', { name: 'Playback position', exact: true }).press('Home');
      await active().getByRole('button', { name: 'Play', exact: true }).click();
      await openTool('Compress');
      assert(await page.locator('video').evaluate((el) => el.paused), 'hidden video pauses');
      await openTool('Motion Photo');
      await capture('controls-video-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await active().locator('.pf-motion-row').click();
      await capture('controls-video-mobile');
      report.interactions.push(
        'synthetic local video: styled play/pause, mute, seek and hidden-tool pause',
      );
    }
  }
  if (run('ranges')) {
    for (const tool of ['compression', 'ios']) {
      await page.goto(`${origin}/?tool=${tool}&lng=en`);
      await active().locator('.pf-range-field').waitFor();
      for (const width of [1576, 856, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await settleLayout();
        await checkRanges();
      }
      await page.setViewportSize({ width: 1576, height: 828 });
      const range = active().locator('.pf-range-field input[type=range]').first();
      await range.press('End');
      assert.equal(
        await range.evaluate((el) => el.style.getPropertyValue('--pf-range-fraction')),
        '1',
      );
      await range.press('Home');
      assert.equal(
        await range.evaluate((el) => el.style.getPropertyValue('--pf-range-fraction')),
        '0',
      );
      await page.getByRole('button', { name: 'Toggle color mode', exact: true }).click();
      await checkRanges();
      await capture(`ranges-${tool}-enabled`);
      if (tool === 'compression') {
        await choose(active().getByRole('combobox', { name: 'Format', exact: true }), 'oxipng');
        await active().getByRole('switch', { name: 'Resize', exact: true }).click();
        await active().locator('.pf-settings-fields > details > summary').click();
        await active().getByRole('button', { name: 'Percentage', exact: true }).click();
        for (const width of [1576, 390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await settleLayout();
          await checkRanges();
        }
        await active().locator('.pf-range-field').last().scrollIntoViewIfNeeded();
        await capture('ranges-compression-disabled-and-percentage');
      }
    }
    report.interactions.push(
      'quality/percentage ranges: shared height, transparent background, enabled/disabled states, endpoints and both themes',
    );
  }
  if (run('player')) {
    assert(
      process.env.PICFORGE_PLAYER_FIXTURES,
      'Set PICFORGE_PLAYER_FIXTURES to the generated fixture prefix',
    );
    const measurements = [];
    const near = (a, b, label) => assert(Math.abs(a - b) <= 1, `${label}: ${a} != ${b}`);
    for (const shape of ['portrait', 'landscape']) {
      const jpg = await readFile(`${process.env.PICFORGE_PLAYER_FIXTURES}-${shape}.jpg`);
      const mp4 = await readFile(`${process.env.PICFORGE_PLAYER_FIXTURES}-${shape}.mp4`);
      for (const tool of ['android', 'ios']) {
        await page.setViewportSize({ width: 1576, height: 828 });
        await page.goto(`${origin}/?tool=${tool}&lng=en`);
        await active().locator('input[type=file]').waitFor({ state: 'attached' });
        await active()
          .locator('input[type=file]')
          .setInputFiles(
            tool === 'android'
              ? { name: `${shape}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.concat([jpg, mp4]) }
              : [
                  { name: `${shape}.jpg`, mimeType: 'image/jpeg', buffer: jpg },
                  { name: `${shape}.mp4`, mimeType: 'video/mp4', buffer: mp4 },
                ],
          );
        await active()
          .getByRole('button', {
            name: tool === 'android' ? 'Extract pending files' : 'Process batch',
            exact: true,
          })
          .click();
        await active().getByText('1 / 1 completed', { exact: true }).waitFor({ timeout: 120000 });
        await active().locator('.pf-motion-row').click();
        await page.waitForFunction(
          () =>
            document.querySelector('.pf-tool-panel:not([hidden]) video')?.duration > 0 ||
            document.querySelector('.pf-motion-preview-note'),
        );
        if (await active().locator('.pf-motion-preview-note').isVisible()) {
          report.interactions.push(
            `${tool}/${shape}: native playback unavailable; layout retains download fallback`,
          );
          continue;
        }
        for (const [width, height] of [
          [1576, 828],
          [1440, 1120],
          [856, 718],
          [390, 844],
          [320, 844],
        ]) {
          await page.setViewportSize({ width, height });
          await settleLayout();
          const rects = await active()
            .locator('[data-kind="video"]')
            .evaluate((pane) => {
              const pick = (selector) =>
                pane.querySelector(selector).getBoundingClientRect().toJSON();
              return {
                pane: pane.getBoundingClientRect().toJSON(),
                frame: pick('.pf-motion-media-frame'),
                video: pick('video'),
                dock: pick('.pf-video-controls'),
                seek: pick('input[type=range]'),
                time: pick('.pf-video-time'),
                buttons: [...pane.querySelectorAll('.pf-video-controls button')].map((button) =>
                  button.getBoundingClientRect().toJSON(),
                ),
              };
            });
          near(rects.pane.x, rects.frame.x, 'frame start');
          near(rects.pane.width, rects.frame.width, 'frame width');
          near(rects.frame.x, rects.dock.x, 'dock start');
          near(rects.frame.width, rects.dock.width, 'dock width');
          near(rects.video.bottom, rects.dock.y, 'dock follows video stage');
          assert(rects.seek.bottom <= rects.buttons[0].y + 1, 'timeline has its own row');
          assert(rects.time.right <= rects.buttons[1].x + 1, 'timer fits before mute control');
          for (const button of rects.buttons)
            assert(
              button.x >= rects.dock.x && button.right <= rects.dock.right + 1,
              'button fits dock',
            );
          if (width >= 768 && tool === 'ios') {
            const media = await active()
              .locator('.pf-motion-output')
              .evaluate((output) => {
                const image = output.querySelector('[data-kind=image] img');
                const video = output.querySelector('video');
                const stage = video.getBoundingClientRect();
                const scale = Math.min(
                  1,
                  stage.width / video.videoWidth,
                  stage.height / video.videoHeight,
                );
                return {
                  image: image.getBoundingClientRect().toJSON(),
                  video: {
                    width: video.videoWidth * scale,
                    height: video.videoHeight * scale,
                    y: stage.y + (stage.height - video.videoHeight * scale) / 2,
                  },
                  fit: getComputedStyle(video).objectFit,
                };
              });
            assert.equal(
              media.fit,
              'scale-down',
              'small video keeps its native size, like the paired photo',
            );
            near(media.image.width, media.video.width, 'paired visible media width');
            near(media.image.height, media.video.height, 'paired visible media height');
            near(media.image.y, media.video.y, 'paired visible media top');
            const downloads = await active()
              .locator('.pf-motion-media-pane > .pf-text-button')
              .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().y));
            near(downloads[0], downloads[1], 'paired download row');
          }
          await checkRanges();
          measurements.push({ tool, shape, width, dockWidth: rects.dock.width });
          if (width === 1576 || width === 390) {
            await active().locator('.pf-video-controls').scrollIntoViewIfNeeded();
            await capture(`player-${tool}-${shape}-${width}`);
          }
        }
        await page.setViewportSize({ width: 1576, height: 828 });
        await settleLayout();
        const video = active().locator('video');
        const seek = active().getByRole('slider', { name: 'Playback position' });
        if (shape === 'portrait' && tool === 'android') {
          const fullscreen = active().locator('.pf-video-fullscreen');
          if (await fullscreen.isEnabled()) {
            await fullscreen.click();
            await page.waitForFunction(() =>
              document.fullscreenElement?.classList.contains('pf-video-player'),
            );
            await settleLayout();
            assert.equal(
              await video.evaluate((el) => getComputedStyle(el).objectFit),
              'contain',
              'fullscreen expands video to the available stage',
            );
            const dock = await active().locator('.pf-video-controls').boundingBox();
            near(dock.width, 1576, 'fullscreen dock width');
            near(dock.y + dock.height, 828, 'fullscreen dock bottom');
            await capture('player-fullscreen');
            await fullscreen.click();
            await page.waitForFunction(() => !document.fullscreenElement);
          }
          await page.evaluate(() => {
            const root = document.querySelector('.pf-tool-panel:not([hidden])');
            const input = root.querySelector('.pf-video-controls input');
            const video = root.querySelector('video');
            window.playerProbe = { paints: 0, timeUpdates: 0 };
            const observer = new MutationObserver(() => window.playerProbe.paints++);
            observer.observe(input, { attributes: true, attributeFilter: ['style'] });
            video.addEventListener('timeupdate', () => window.playerProbe.timeUpdates++);
          });
          await active().getByRole('button', { name: 'Play', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('.pf-tool-panel:not([hidden]) video')?.ended,
          );
          const probe = await page.evaluate(() => window.playerProbe);
          assert(
            probe.paints > probe.timeUpdates + 3,
            'timeline updates between timeupdate events',
          );
          assert.equal(
            await seek.evaluate((el) => el.style.getPropertyValue('--pf-range-fraction')),
            '1',
            'sub-second completion reaches the end',
          );
          assert(
            (await active().locator('.pf-video-time').innerText()).includes('.8'),
            'short clip uses tenths',
          );
          await seek.press('Home');
          // A pending decoder update must not move the thumb while the pointer owns it.
          const box = await seek.boundingBox();
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 6 });
          const draft = Number(await seek.inputValue());
          await video.evaluate((el) => {
            el.currentTime = 0;
            el.dispatchEvent(new Event('timeupdate'));
          });
          near(Number(await seek.inputValue()) * 1000, draft * 1000, 'scrub is not overwritten');
          await page.mouse.up();
          assert(await video.evaluate((el) => el.paused), 'paused scrub remains paused');
          await seek.press('End');
          assert.equal(
            await seek.evaluate((el) => el.style.getPropertyValue('--pf-range-fraction')),
            '1',
          );
        }
        if (shape === 'landscape' && tool === 'android') {
          await active().getByRole('button', { name: 'Play', exact: true }).click();
          await page.waitForFunction(
            () => document.querySelector('.pf-tool-panel:not([hidden]) video')?.currentTime > 0.1,
          );
          const box = await seek.boundingBox();
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
          await page.mouse.down();
          assert(await video.evaluate((el) => el.paused), 'scrubbing suspends playback');
          await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
          await page.mouse.up();
          await page.waitForFunction(
            () => !document.querySelector('.pf-tool-panel:not([hidden]) video')?.paused,
          );
          await openTool('Compress');
          const hiddenVideo = page.locator('.pf-tool-panel[hidden] video');
          const hiddenSeek = page.locator('.pf-tool-panel[hidden] .pf-video-controls input');
          assert(await hiddenVideo.evaluate((el) => el.paused), 'hidden tool pauses');
          const before = await hiddenSeek.inputValue();
          await page.evaluate(
            () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
          );
          assert.equal(await hiddenSeek.inputValue(), before, 'hidden timeline stops');
        }
      }
    }
    report.playerMeasurements = measurements;
    report.interactions.push(
      'portrait/landscape in Android+iOS: full-width two-row dock, slider/number geometry, sub-second frame updates, scrubbing ownership, pause/resume and hidden cleanup',
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
