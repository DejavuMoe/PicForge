import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';
import { validateEngineResult } from './validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'packages/app/package.json'));
const { build, preview } = await import(
  resolve(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')
);

// ---- Selection (unknown options fail; selection is recorded in the report) ----
const layer = process.env.PICFORGE_BENCH_LAYER || 'legacy';
assert(
  ['legacy', 'engine', 'codec'].includes(layer),
  `Unknown PICFORGE_BENCH_LAYER: ${layer} (legacy|engine|codec). The application layer is a separate script: scripts/performance/application.mjs`,
);
const engine = process.env.PICFORGE_BROWSER || 'chromium';
assert(
  ['chromium', 'firefox', 'webkit'].includes(engine),
  `Unknown PICFORGE_BROWSER: ${engine} (chromium|firefox|webkit)`,
);
const policy = process.env.PICFORGE_BENCH_ENGINE || 'compat';
assert(
  ['auto', 'compat', 'vips'].includes(policy),
  `Unknown PICFORGE_BENCH_ENGINE: ${policy} (auto|compat|vips)`,
);
const repeats = Number(process.env.PICFORGE_BENCH_REPEATS || 3);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20, 'Repeats must be 1–20');
const requestedCases = process.env.PICFORGE_BENCH_CASES
  ? process.env.PICFORGE_BENCH_CASES.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : null;

// ---- Installed colour profiles (no system changes; missing P3 is BLOCKED) ----
const srgbProfilePath =
  process.env.PICFORGE_SRGB_PROFILE ||
  ['/usr/lib/office6/qt/icc/sRGB.icc', '/usr/share/ghostscript/iccprofiles/srgb.icc'].find(
    (candidate) => existsSync(candidate),
  ) ||
  null;
const p3ProfilePath =
  process.env.PICFORGE_P3_PROFILE && existsSync(process.env.PICFORGE_P3_PROFILE)
    ? process.env.PICFORGE_P3_PROFILE
    : null;
const profileInfo = (profilePath) =>
  profilePath
    ? {
        path: profilePath,
        sha256: createHash('sha256').update(readFileSync(profilePath)).digest('hex'),
      }
    : null;
const srgbProfile = profileInfo(srgbProfilePath);
const p3Profile = profileInfo(p3ProfilePath);

const output =
  process.env.PICFORGE_BENCH_OUTPUT || (await mkdtemp(resolve(tmpdir(), 'picforge-baseline-')));
await mkdir(output, { recursive: true });
const outDir = await mkdtemp(resolve(tmpdir(), 'picforge-benchmark-build-'));
const config = {
  root: resolve(root, 'packages/app'),
  configFile: resolve(root, 'packages/app/vite.config.mjs'),
  logLevel: 'error',
};

// ---- Legacy diagnostic corpus (unchanged) ----
const legacyCases = [
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

// ---- Real-engine corpus: S01–S06 plus harness acceptance cases ----
const normalize = {
  mode: 'absolute',
  maxWidth: 1920,
  maxHeight: 1920,
  method: 'contain',
};
const s01 = {
  id: 'S01',
  mode: 'normal',
  width: 4000,
  height: 3000,
  mime: 'image/jpeg',
  fixtureKind: 'photo',
  format: 'mozjpeg',
  quality: 75,
  compareLegacy: true,
};
const s02 = {
  id: 'S02',
  mode: 'normal',
  width: 6000,
  height: 4000,
  mime: 'image/jpeg',
  fixtureKind: 'photo',
  format: 'mozjpeg',
  quality: 75,
  resize: normalize,
  expected: [1920, 1280],
  compareLegacy: true,
};
const s03 = {
  id: 'S03',
  mode: 'normal',
  width: 8000,
  height: 6000,
  mime: 'image/jpeg',
  fixtureKind: 'photo',
  format: 'mozjpeg',
  quality: 75,
  resize: normalize,
  expected: [1920, 1440],
  compareLegacy: true,
};
const s04 = {
  id: 'S04',
  mode: 'normal',
  width: 6000,
  height: 4000,
  mime: 'image/jpeg',
  fixtureKind: 'photo',
  format: 'webp',
  quality: 75,
  advanced: { method: 4 },
  resize: normalize,
  expected: [1920, 1280],
  compareLegacy: true,
};
const s05 = {
  id: 'S05',
  mode: 'normal',
  width: 2400,
  height: 1600,
  mime: 'image/png',
  fixtureKind: 'alpha',
  format: 'webp',
  quality: 75,
  advanced: { method: 4 },
  resize: normalize,
  expected: [1920, 1280],
  compareLegacy: true,
  rawParity: true,
};
// EXIF 1/3 keep 320x240; 6/8 rotate 90° so the normalized source/output swap.
const exifCases = [1, 3, 6, 8].map((orientation) => ({
  id: `C01-o${orientation}`,
  mode: 'normal',
  width: 320,
  height: 240,
  mime: 'image/jpeg',
  fixtureKind: 'orientation',
  orientation,
  format: 'mozjpeg',
  quality: 75,
  expected: orientation === 6 || orientation === 8 ? [240, 320] : [320, 240],
}));
const resizeCases = [
  [
    'contain',
    { mode: 'absolute', maxWidth: 1920, maxHeight: 1080, method: 'contain' },
    [1620, 1080],
  ],
  ['cover', { mode: 'absolute', maxWidth: 1920, maxHeight: 1080, method: 'cover' }, [1920, 1080]],
  [
    'stretch',
    { mode: 'absolute', maxWidth: 1920, maxHeight: 1080, method: 'stretch' },
    [1920, 1080],
  ],
  [
    'percentage',
    { mode: 'percentage', maxWidth: 1, maxHeight: 1, percentage: 50, method: 'contain' },
    [1200, 800],
  ],
].map(([name, resize, expected]) => ({
  id: `C02-${name}`,
  mode: 'normal',
  width: 2400,
  height: 1600,
  mime: 'image/jpeg',
  fixtureKind: 'photo',
  format: 'mozjpeg',
  quality: 75,
  resize,
  expected,
}));

const codecCases = [
  {
    id: 'C03-avif',
    mode: 'normal',
    width: 2400,
    height: 1600,
    mime: 'image/jpeg',
    fixtureKind: 'photo',
    format: 'avif',
    quality: 75,
    resize: { mode: 'absolute', maxWidth: 1920, maxHeight: 1920, method: 'contain' },
    expected: [1920, 1280],
  },
  {
    id: 'C03-oxipng',
    mode: 'normal',
    width: 320,
    height: 240,
    mime: 'image/png',
    fixtureKind: 'alpha',
    format: 'oxipng',
    quality: 75,
    expected: [320, 240],
  },
];

const formatCases = [
  {
    id: 'C04-svg',
    mode: 'normal',
    width: 64,
    height: 48,
    mime: 'image/svg+xml',
    fixtureKind: 'svg',
    format: 'mozjpeg',
    quality: 75,
    expected: [64, 48],
  },
  {
    id: 'C04-bmp',
    mode: 'normal',
    width: 64,
    height: 48,
    mime: 'image/bmp',
    fixtureKind: 'bmp',
    format: 'mozjpeg',
    quality: 75,
    expected: [64, 48],
  },
  {
    id: 'C04-gif-static',
    mode: 'normal',
    width: 1,
    height: 1,
    mime: 'image/gif',
    fixtureKind: 'static-gif',
    format: 'mozjpeg',
    quality: 75,
    expected: [1, 1],
  },
  {
    id: 'C04-avif-input',
    mode: 'normal',
    width: 64,
    height: 48,
    mime: 'image/avif',
    fixtureKind: 'avif-input',
    format: 'mozjpeg',
    quality: 75,
    expected: [64, 48],
  },
];

// Independent LittleCMS/ImageMagick reference, never a browser Canvas reference.
const colorCases = [];
for (const [name, profile] of [
  ['srgb', srgbProfile],
  ['p3', p3Profile],
]) {
  const id = `C05-${name}-icc`;
  const spec = {
    id,
    mode: 'normal',
    width: 128,
    height: 96,
    mime: 'image/png',
    format: 'mozjpeg',
    quality: 75,
    expected: [64, 48],
    resize: { mode: 'absolute', maxWidth: 64, maxHeight: 48, method: 'contain' },
    colorReference: true,
  };
  if (layer === 'engine' && (!requestedCases || requestedCases.includes(id))) {
    if (!profile || !srgbProfile) {
      spec.blocked = `${id}: required ICC profile missing`;
    } else {
      assert(
        name !== 'p3' || profile.sha256 !== srgbProfile.sha256,
        'P3 and sRGB profiles must differ',
      );
      const directory = resolve(output, 'color-fixtures');
      await mkdir(directory, { recursive: true });
      const ppm = resolve(directory, 'patches.ppm');
      const patches = [
        [180, 80, 50],
        [60, 180, 70],
        [80, 60, 190],
        [128, 128, 128],
      ];
      const pixels = Buffer.alloc(128 * 96 * 3);
      for (let y = 0; y < 96; y++)
        for (let x = 0; x < 128; x++) {
          const color = patches[(y >= 48 ? 2 : 0) + (x >= 64 ? 1 : 0)];
          pixels.set(color, (y * 128 + x) * 3);
        }
      await writeFile(ppm, Buffer.concat([Buffer.from('P6\n128 96\n255\n'), pixels]));
      const fixture = resolve(directory, `${name}.png`);
      const magick = (args) => execFileSync('magick', args, { maxBuffer: 1024 * 1024 });
      magick([ppm, '-profile', profile.path, '-depth', '8', fixture]);
      const embedded = magick([fixture, 'icc:-']);
      const embeddedSha256 = createHash('sha256').update(embedded).digest('hex');
      assert.equal(embeddedSha256, profile.sha256, `${id}: embedded profile differs`);
      const reference = magick([
        fixture,
        '-intent',
        'relative',
        '-profile',
        srgbProfile.path,
        '-resize',
        '64x48!',
        '-depth',
        '8',
        'rgba:-',
      ]);
      assert.equal(reference.length, 64 * 48 * 4);
      Object.assign(spec, {
        fixtureBase64: readFileSync(fixture).toString('base64'),
        referenceRgbaBase64: reference.toString('base64'),
        profileSha256: profile.sha256,
        embeddedProfileSha256: embeddedSha256,
        referenceSha256: createHash('sha256').update(reference).digest('hex'),
        referenceTool: magick(['-version']).toString().split('\n')[0],
      });
    }
  }
  colorCases.push(spec);
}

const engineCases = [
  s01,
  s02,
  s03,
  s04,
  s05,
  ...exifCases,
  ...resizeCases,
  ...codecCases,
  ...formatCases,
  ...colorCases,
  { id: 'S06', mode: 'batch', sources: [s01, s02, s03, s04, s05] },
  {
    id: 'A01',
    mode: 'animation',
    width: 1,
    height: 1,
    mime: 'image/gif',
    fixtureKind: 'animation',
    format: 'webp',
    quality: 80,
    advanced: { method: 4 },
  },
  {
    id: 'S08-corrupt',
    mode: 'corrupt',
    width: 64,
    height: 64,
    mime: 'image/jpeg',
    fixtureKind: 'photo',
    format: 'mozjpeg',
    quality: 75,
  },
  {
    id: 'S08-cancel',
    mode: 'cancel',
    policy: 'compat',
    width: 4000,
    height: 3000,
    mime: 'image/jpeg',
    fixtureKind: 'photo',
    format: 'mozjpeg',
    quality: 75,
  },
  {
    id: 'S08-target',
    mode: 'target',
    width: 100,
    height: 100,
    mime: 'image/jpeg',
    fixtureKind: 'photo',
    format: 'mozjpeg',
    quality: 75,
    resize: { mode: 'absolute', maxWidth: 10000, maxHeight: 10000, method: 'stretch' },
  },
];

// ---- Validate selection against the union of known cases ----
const CODEC_CASE_ID = 'codec-view';
const known = new Set([
  ...legacyCases.map((c) => c.name),
  ...engineCases.map((c) => c.id),
  CODEC_CASE_ID,
]);
if (requestedCases) {
  for (const id of requestedCases) {
    assert(known.has(id), `Unknown PICFORGE_BENCH_CASES entry: ${id}`);
  }
}
const runLegacy = layer === 'legacy';
const runEngine = layer === 'engine';
const runCodec = layer === 'codec';
const selectedLegacy = !runLegacy
  ? []
  : requestedCases
    ? legacyCases.filter((c) => requestedCases.includes(c.name))
    : legacyCases;
const selectedEngine = !runEngine
  ? []
  : requestedCases
    ? engineCases.filter((c) => requestedCases.includes(c.id))
    : engineCases;
const selectedCodec =
  runCodec && (!requestedCases || requestedCases.includes(CODEC_CASE_ID)) ? [CODEC_CASE_ID] : [];
if (requestedCases && runLegacy && selectedLegacy.length === 0) {
  throw new Error('No legacy cases selected; refusing to report a zero-case run as success');
}
if (requestedCases && runEngine && selectedEngine.length === 0) {
  throw new Error('No engine cases selected; refusing to report a zero-case run as success');
}
if (requestedCases && runCodec && selectedCodec.length === 0) {
  throw new Error('No codec cases selected; refusing to report a zero-case run as success');
}
const selectedIds = new Set([
  ...(runLegacy ? selectedLegacy.map((c) => c.name) : []),
  ...(runEngine ? selectedEngine.map((c) => c.id) : []),
  ...(runCodec ? selectedCodec : []),
]);
const skipped = requestedCases ? requestedCases.filter((id) => !selectedIds.has(id)) : [];
const execution = {
  layers: [runLegacy && 'legacy', runEngine && 'engine', runCodec && 'codec'].filter(Boolean),
  vipsProbe: process.env.PICFORGE_BENCH_VIPS_PROBE === '1',
  vipsFallbackSelfTest: process.env.PICFORGE_BENCH_FORCE_VIPS_FAIL === '1',
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

const report = {
  schemaVersion: 1,
  date: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  node: process.version,
  layer,
  engine,
  policy,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  systemMemoryBytes: totalmem(),
  repeats,
  requestedCases,
  selectedLegacy: selectedLegacy.map((c) => c.name),
  selectedEngine: selectedEngine.map((c) => c.id),
  selectedCodec,
  skipped,
  execution,
  profiles: { srgb: srgbProfile, p3: p3Profile },
  color: {
    srgbTagged: !!srgbProfile,
    p3Tagged: !!p3Profile,
    p3Status: p3Profile ? 'available' : 'BLOCKED: no Display P3 ICC profile is installed',
  },
  cases: [],
  engineCases: [],
  codecView: null,
};

// Playwright disables Firefox ICC correction for screenshot reproducibility.
// Restore tagged-media conversion and pin the reference display/intent for color QA.
const firefoxUserPrefs =
  engine === 'firefox'
    ? {
        'gfx.color_management.mode': 2,
        'gfx.color_management.rendering_intent': 1,
        ...(srgbProfile ? { 'gfx.color_management.display_profile': srgbProfile.path } : {}),
      }
    : undefined;
report.firefoxUserPrefs = firefoxUserPrefs ?? null;

let browser;
let page;
try {
  browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    firefoxUserPrefs,
    ...(process.env.PICFORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PICFORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  report.browserVersion = browser.version();
  page = await browser.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requestedWasm = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.wasm')) requestedWasm.push(path);
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => !!window.baseline);
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
    crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    longTasks: PerformanceObserver.supportedEntryTypes.includes('longtask'),
  }));
  report.encoderDefaults = await page.evaluate(() => window.baseline.defaults);

  if (runLegacy) {
    report.animation = await page.evaluate(() => window.baseline.animationProbe());
    for (const spec of selectedLegacy) {
      const result = await page.evaluate(
        async ({ spec, repeats }) => window.baseline.run(spec, repeats),
        { spec, repeats },
      );
      report.cases.push(result);
      await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(
        `legacy ${spec.name}: ${result.status}${result.samples.length ? ` (${result.samples[1].totalMs.toFixed(1)} ms warm)` : ''}`,
      );
    }
    if (!requestedCases) {
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
    } else {
      for (const result of report.cases) {
        if (result.status === 'rejected') continue;
        for (const [name, dimensions] of Object.entries({
          contain: [1620, 1080],
          cover: [1920, 1080],
          stretch: [1920, 1080],
          percentage: [1200, 800],
        })) {
          if (result.name === `resize-${name}`) {
            assert.deepEqual([result.samples[0].width, result.samples[0].height], dimensions);
          }
        }
      }
    }
  }

  if (runEngine) {
    const validationFailures = [];
    for (const spec of selectedEngine) {
      if (spec.blocked) {
        report.engineCases.push({ id: spec.id, status: 'BLOCKED', reason: spec.blocked });
        validationFailures.push(spec.blocked);
        await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
        continue;
      }
      const wasmBefore = requestedWasm.length;
      const result = await page.evaluate(
        async ({ spec, repeats, policy }) =>
          window.baseline.engineRun(spec, { repeats, policy: spec.policy ?? policy }),
        { spec, repeats, policy },
      );
      result.wasmRequests = [...new Set(requestedWasm.slice(wasmBefore))];
      report.engineCases.push(result);
      await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
      await writeFile(
        resolve(output, 'engine-results.json'),
        JSON.stringify({ ...report, cases: undefined, engineCases: report.engineCases }, null, 2) +
          '\n',
      );
      console.log(`engine ${spec.id}: ${result.status}`);
      const failures = validateEngineResult(spec, result, { repeats });
      if (failures.length > 0) validationFailures.push(...failures);
    }
    if (validationFailures.length > 0) {
      throw new Error(
        `Engine validation failed:\n${validationFailures.map((failure) => `  - ${failure}`).join('\n')}`,
      );
    }

    // Vips availability is opt-in only; it must never expand a selected run.
    if (execution.vipsProbe) {
      const vipsProbe = await page.evaluate(
        async ({ spec, repeats }) =>
          window.baseline.engineRun(spec, { repeats: Math.min(repeats, 1), policy: 'vips' }),
        { spec: s02, repeats },
      );
      const first = vipsProbe.samples?.[0];
      report.vipsProbe = {
        requested: 'vips',
        actual: first?.actualEngine ?? null,
        fallback: first?.fallback ?? false,
        attempts: first?.attempts ?? [],
        status: vipsProbe.status,
      };
      console.log(
        `engine vips-probe: requested=vips actual=${report.vipsProbe.actual} fallback=${report.vipsProbe.fallback}`,
      );
    }

    // Harness self-test for the runtime-fault fallback recording. This injects an
    // explicit runtime fault so the requested/actual/fallback fields are exercised;
    // it is not a product measurement and never labels a fallback as Vips.
    if (execution.vipsFallbackSelfTest) {
      const selfTest = await page.evaluate(
        async ({ spec }) =>
          window.baseline.engineRun(spec, {
            repeats: 0,
            policy: 'vips',
            forceVipsRuntimeFail: true,
          }),
        { spec: s02 },
      );
      const first = selfTest.samples?.[0];
      report.vipsFallbackSelfTest = {
        requested: 'vips',
        actual: first?.actualEngine ?? null,
        fallback: first?.fallback ?? false,
        attempts: first?.attempts ?? [],
        status: selfTest.status,
      };
      console.log(
        `engine vips-fallback-self-test: requested=vips actual=${report.vipsFallbackSelfTest.actual} fallback=${report.vipsFallbackSelfTest.fallback}`,
      );
    }
  }

  if (runCodec) {
    report.codecView = await page.evaluate(() => window.baseline.codecViewCheck());
    await writeFile(
      resolve(output, 'codec-view-results.json'),
      JSON.stringify(report.codecView, null, 2) + '\n',
    );
    console.log(`codec-view: ${report.codecView.pass ? 'pass' : 'FAIL'}`);
    assert.deepEqual(report.codecView.blocked, [], 'codec coverage blocked');
    assert.ok(report.codecView.pass, 'codec view contract failed');
  }

  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: layer=${layer}; results: ${output}`);
} finally {
  try {
    if (page) {
      await page.evaluate(() => window.baseline?.disposeVips?.()).catch(() => {});
    }
  } finally {
    await browser?.close();
    await new Promise((resolveClosed) => server.httpServer.close(resolveClosed));
  }
}
