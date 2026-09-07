// Run with the dev server available: pnpm dev, then node scripts/ui-check.mjs.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = await mkdtemp(resolve(tmpdir(), 'picforge-ui-'));
const testSample = resolve(output, 'test-motion.jpg');
await writeFile(
  testSample,
  Buffer.concat([
    Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]),
    Buffer.from([0, 0, 0, 0x14]),
    Buffer.from('ftypmp42'),
    Buffer.alloc(8),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from('moov'),
    Buffer.from([0, 0, 4, 8]),
    Buffer.from('mdat'),
    Buffer.alloc(1024),
  ]),
);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark']) {
    for (const tool of ['home', 'compression', 'android', 'ios']) {
      await page.goto(`http://127.0.0.1:5173/?tool=${tool}&lng=en`);
      await page.evaluate((mode) => localStorage.setItem('picforge-color-mode', mode), theme);
      await page.reload();
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400); // Let staggered entrances complete before capture.
      // The trigger owns one SVG icon; legacy CSS arrows must never reappear.
      for (const select of await page.getByRole('combobox').all()) {
        assert.equal(
          await select.evaluate((element) => getComputedStyle(element).backgroundImage),
          'none',
          `${theme}/${tool}: legacy select background`,
        );
        assert.equal(await select.locator('svg').count(), 1);
      }
      for (const [width, height] of [
        [375, 667],
        [735, 828],
        [768, 1024],
        [1280, 720],
        [1576, 828],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150); // Allow viewport media-query layout to settle.
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll('button,select,input,h1')]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1);
            })
            .map((element) => ({
              className: element.className,
              text: element.textContent,
              x: element.getBoundingClientRect().x,
              width: element.getBoundingClientRect().width,
            })),
        );
        assert.deepEqual(overflow, [], `${theme}/${tool}/${width} overflow`);
        await page.screenshot({ path: resolve(output, `${theme}-${tool}-${width}.png`) });
      }
    }
  }
  // Navigation keeps visited queues mounted; returning must preserve imported work.
  await page.locator('.pf-tool-nav button').nth(0).click();
  await page
    .locator('input[data-testid="file-input"]')
    .setInputFiles(testSample);
  await page.locator('.pf-file-row').first().waitFor();
  await page.locator('.pf-tool-nav button').nth(1).click();
  await page.locator('.pf-tool-nav button').nth(0).click();
  assert.equal(await page.locator('.pf-file-row').count(), 1);
  await page.locator('.pf-compare-mode-switch').waitFor();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.locator('.pf-file-row').first().click();
  await page.locator('.pf-compare-mode-button').first().click();
  assert.equal(
    await page.locator('.pf-compare-mode-button').first().getAttribute('aria-pressed'),
    'true',
  );
  await page.screenshot({ path: resolve(output, 'compression-mobile-loaded.png') });
  await page.locator('.pf-tool-nav button').nth(1).click();
  const motion = page.locator('.pf-tool-panel:not([hidden])');
  await motion.locator('input[type=file]').setInputFiles(testSample);
  await motion.getByRole('button', { name: 'Process batch', exact: true }).click();
  await motion.locator('.pf-motion-output').waitFor();
  assert.equal(await motion.locator('details').count(), 0);
  assert.equal(await motion.locator('.pf-motion-setup').isVisible(), false);
  const firstResult = await motion.locator('.pf-motion-item').first().boundingBox();
  const body = await motion.locator('.pf-motion-body').boundingBox();
  assert(firstResult.y <= body.y + 22, 'Results must occupy the first content row');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(output, 'android-results.png') });
  await page.locator('.pf-tool-nav button').nth(2).click();
  const ios = page.locator('.pf-tool-panel:not([hidden])');
  const preset = ios.getByRole('combobox').first();
  await preset.click();
  assert.equal(await page.getByRole('listbox').count(), 1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  assert((await preset.textContent()).includes('Smaller'));
  await preset.click();
  await page.keyboard.press('Escape');
  assert.equal(await preset.getAttribute('aria-expanded'), 'false');
  await preset.click();
  await page.getByRole('option').first().click();
  assert((await preset.textContent()).includes('Balanced'));
  await preset.click();
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('listbox').count(), 0);
  assert.equal(await page.locator('select').count(), 0, 'No native selectors remain');
  assert.deepEqual(errors, []);
  console.log(`PASS: themes, five viewports, navigation retention and mobile preview. ${output}`);
} finally {
  await browser.close();
}
