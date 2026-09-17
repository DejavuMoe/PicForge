import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  assertEngineResult,
  validateEngineResult,
  assertApplicationReport,
  summariseLongTasks,
} from './validate.mjs';

const normalSpec = {
  id: 'S01',
  mode: 'normal',
  expected: [1920, 1280],
};
function okSample(overrides = {}) {
  return {
    iteration: 0,
    status: 'ok',
    actualEngine: 'compat',
    outputBytes: 1000,
    outputSha256: 'abc',
    width: 1920,
    height: 1280,
    dimensionsOk: true,
    ...overrides,
  };
}
function normalResult(samples) {
  return { samples };
}

test('valid normal control passes', () => {
  assert.deepEqual(
    validateEngineResult(normalSpec, normalResult([okSample()]), { repeats: 0 }),
    [],
  );
});

test('wrong dimensions fail', () => {
  const failures = validateEngineResult(
    normalSpec,
    normalResult([okSample({ width: 100, height: 100, dimensionsOk: false })]),
    { repeats: 0 },
  );
  assert.ok(failures.length > 0, 'expected failures');
});

test('wrong orientation fails', () => {
  const spec = { id: 'C01-o6', mode: 'normal', orientation: 6 };
  const failures = validateEngineResult(spec, normalResult([okSample({ orientationOk: false })]), {
    repeats: 0,
  });
  assert.ok(failures.some((f) => f.includes('orientationOk')));
});

test('missing samples fails', () => {
  assert.ok(validateEngineResult(normalSpec, {}, { repeats: 0 }).length > 0);
});

test('wrong sample count fails', () => {
  assert.ok(
    validateEngineResult(normalSpec, normalResult([okSample()]), { repeats: 2 }).length > 0,
  );
});

test('mixed success and error samples fail', () => {
  const failures = validateEngineResult(
    normalSpec,
    normalResult([okSample(), okSample({ iteration: 1, status: 'error', error: 'boom' })]),
    { repeats: 1 },
  );
  assert.ok(failures.some((f) => f.includes('status error')));
});

test('partially failed batch fails', () => {
  const spec = { id: 'S06', mode: 'batch', sources: [{ id: 'S01' }, { id: 'S02' }] };
  const result = {
    samples: [
      {
        iteration: 0,
        status: 'ok',
        concurrency: 2,
        results: [
          { id: 'S01', status: 'ok', engine: 'compat', outputBytes: 10, outputSha256: 'a' },
          { id: 'S02', status: 'error', error: 'boom' },
        ],
      },
    ],
  };
  assert.ok(validateEngineResult(spec, result, { repeats: 0 }).length > 0);
});

test('batch with a missing or duplicated task fails', () => {
  const spec = { id: 'S06', mode: 'batch', sources: [{ id: 'S01' }, { id: 'S02' }] };
  const base = { status: 'ok', engine: 'compat', outputBytes: 10, outputSha256: 'a' };
  const result = {
    samples: [
      {
        iteration: 0,
        status: 'ok',
        concurrency: 2,
        results: [
          { id: 'S01', ...base },
          { id: 'S01', ...base },
        ],
      },
    ],
  };
  const failures = validateEngineResult(spec, result, { repeats: 0 });
  assert.ok(failures.some((f) => f.includes('S02')));
  assert.ok(failures.some((f) => f.includes('count 2')));
});

test('ordinary Error instead of cancellation fails', () => {
  const spec = { id: 'S08-cancel', mode: 'cancel' };
  const result = {
    samples: [{ iteration: 0, status: 'error', error: 'boom', errorName: 'Error' }],
  };
  assert.ok(validateEngineResult(spec, result, { repeats: 0 }).length > 0);
  const good = {
    samples: [
      {
        iteration: 0,
        status: 'cancelled',
        error: null,
        errorName: 'AbortError',
        cancelCheck: { loadStarts: 1, cleanup: true, retry: { outputBytes: 10 } },
      },
    ],
  };
  assert.deepEqual(validateEngineResult(spec, good, { repeats: 0 }), []);
});

test('unrelated error instead of target rejection fails', () => {
  const spec = { id: 'S08-target', mode: 'target' };
  const bad = { samples: [{ iteration: 0, status: 'error', error: 'Failed to decode image' }] };
  assert.ok(validateEngineResult(spec, bad, { repeats: 0 }).length > 0);
  const good = {
    samples: [{ iteration: 0, status: 'rejected', error: 'target: pixel limit', attempts: [] }],
  };
  assert.deepEqual(validateEngineResult(spec, good, { repeats: 0 }), []);
});

test('corrupt input with an unrelated reason fails', () => {
  const spec = { id: 'S08-corrupt', mode: 'corrupt' };
  const bad = { samples: [{ iteration: 0, status: 'error', error: 'Out of memory' }] };
  assert.ok(validateEngineResult(spec, bad, { repeats: 0 }).length > 0);
  const good = {
    samples: [
      {
        iteration: 0,
        status: 'error',
        errorName: 'Error',
        error: 'Failed to read image dimensions',
        attempts: [],
        actualEngine: null,
        fallback: false,
      },
    ],
  };
  assert.deepEqual(validateEngineResult(spec, good, { repeats: 0 }), []);
});

test('parity gate rejects a quality regression', () => {
  const spec = { id: 'S02', mode: 'normal', compareLegacy: true };
  const result = {
    samples: [okSample({ width: 1920, height: 1280 })],
    parity: { byteIdentical: false, dimensionsMatch: true, rgbMae: 40, alphaMae: 0 },
  };
  const failures = validateEngineResult(spec, result, { repeats: 0 });
  assert.ok(failures.some((f) => f.includes('rgbMae')));
});

test('the runner wrapper throws and a child exits nonzero without printing PASS', () => {
  const spec = { id: 'S01', mode: 'normal', expected: [1920, 1280] };
  const bad = { samples: [okSample({ width: 10, height: 10, dimensionsOk: false })] };
  assert.throws(() => assertEngineResult(spec, bad, { repeats: 0 }), /Engine validation failed/);

  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import { assertEngineResult } from './scripts/performance/validate.mjs';",
        "const spec = { id: 'S01', mode: 'normal', expected: [1920, 1280] };",
        "const bad = { samples: [{ iteration: 0, status: 'ok', actualEngine: 'compat', outputBytes: 1, outputSha256: 'a', width: 10, height: 10, dimensionsOk: false }] };",
        'assertEngineResult(spec, bad, { repeats: 0 });',
        "console.log('PASS');",
      ].join('\n'),
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  assert.notEqual(child.status, 0);
  assert.ok(!String(child.stdout).includes('PASS'));
});

test('batch validates dimensions and engine against each source', () => {
  const spec = { id: 'S06', mode: 'batch', sources: [normalSpec] };
  const task = { ...okSample(), id: 'S01', engine: 'compat' };
  const result = { samples: [{ iteration: 0, status: 'ok', concurrency: 2, results: [task] }] };
  assert.deepEqual(validateEngineResult(spec, result, { repeats: 0 }), []);
  for (const change of [{ width: 1 }, { engine: 'bogus' }, { height: null }]) {
    assert.ok(
      validateEngineResult(
        spec,
        { samples: [{ ...result.samples[0], results: [{ ...task, ...change }] }] },
        { repeats: 0 },
      ).length,
    );
  }
});

test('required parity and finite quality metrics cannot disappear', () => {
  const spec = { ...normalSpec, compareLegacy: true };
  const good = {
    byteIdentical: false,
    dimensionsMatch: true,
    rgbMae: 1,
    alphaMae: 0,
    blackRgbMae: 1,
    whiteRgbMae: 1,
  };
  assert.deepEqual(
    validateEngineResult(spec, { samples: [okSample()], parity: good }, { repeats: 0 }),
    [],
  );
  for (const parity of [
    null,
    { dimensionsMatch: true },
    ...[undefined, null, NaN, Infinity, -1, 40].map((rgbMae) => ({ ...good, rgbMae })),
    { ...good, blackRgbMae: 40 },
  ]) {
    assert.ok(
      validateEngineResult(spec, { samples: [okSample()], parity }, { repeats: 0 }).length,
      JSON.stringify(parity),
    );
  }
});

test('target rejection requires its specific reason and complete evidence', () => {
  const spec = { id: 'S08-target', mode: 'target' };
  for (const sample of [
    { status: 'rejected', error: 'Out of memory', attempts: [] },
    { status: 'rejected', error: 'target: pixel limit' },
  ])
    assert.ok(
      validateEngineResult(spec, { samples: [{ iteration: 0, ...sample }] }, { repeats: 0 }).length,
    );
});

test('color reference checks must exist and reject a color change with correct dimensions', () => {
  const spec = { ...normalSpec, colorReference: true, profileSha256: 'profile' };
  const good = {
    dimensionsMatch: true,
    rgbMae: 1,
    alphaMae: 0,
    blackRgbMae: 1,
    whiteRgbMae: 1,
    swatchMaxError: 2,
    profileSha256: 'profile',
  };
  assert.deepEqual(
    validateEngineResult(spec, { samples: [{ ...okSample(), colorCheck: good }] }, { repeats: 0 }),
    [],
  );
  assert.ok(
    validateEngineResult(
      spec,
      { samples: [{ ...okSample(), colorCheck: { ...good, swatchMaxError: 50 } }] },
      { repeats: 0 },
    ).length,
  );
  for (const colorCheck of [
    null,
    { dimensionsMatch: true, rgbMae: 60, alphaMae: 0, blackRgbMae: 60, whiteRgbMae: 60 },
  ]) {
    assert.ok(
      validateEngineResult(spec, { samples: [{ ...okSample(), colorCheck }] }, { repeats: 0 })
        .length,
    );
  }
});

function applicationReport() {
  return {
    repeats: 0,
    failures: [],
    samples: [{ iteration: 0, status: 'ok', pageErrors: [], pageWindowMs: 10 }],
    cancelRetry: {
      status: 'ok',
      pageErrors: [],
      noLateStalePublication: true,
      doneBeforeImport: 1,
      doneAfterCancel: 1,
      doneAfterRetry: 2,
    },
    batch: {
      status: 'ok',
      pageErrors: [],
      imported: 2,
      completed: 2,
      outputs: [
        [1600, 1200],
        [800, 600],
      ].map((dimensions, index) => ({
        name: `batch-${index}.jpg`,
        bytes: 5,
        dimensions,
        expected: [...dimensions],
      })),
    },
  };
}

test('application final gate rejects cancelled-page errors, stale results and blocked coverage', () => {
  const good = applicationReport();
  assert.doesNotThrow(() => assertApplicationReport(good));
  for (const change of [
    { pageErrors: ['uncaught'] },
    { noLateStalePublication: false },
    { status: 'BLOCKED' },
    { doneAfterRetry: 1 },
  ]) {
    assert.throws(() =>
      assertApplicationReport({ ...good, cancelRetry: { ...good.cancelRetry, ...change } }),
    );
  }
  assert.throws(() => assertApplicationReport({ ...good, batch: null }));
  const code = `import { assertApplicationReport } from './scripts/performance/validate.mjs'; assertApplicationReport(${JSON.stringify({ ...good, cancelRetry: { status: 'BLOCKED' } })}); console.log('PASS');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
  });
  assert.notEqual(child.status, 0);
  assert.ok(!child.stdout.includes('PASS'));
});

test('long tasks delivered during drain cannot extend the frozen completion window', () => {
  const metrics = {
    supported: true,
    start: 100,
    end: 200,
    longTasks: [
      { startTime: 20, duration: 60 },
      { startTime: 120, duration: 60 },
      { startTime: 220, duration: 60 },
    ],
  };
  assert.equal(summariseLongTasks(metrics).longTaskCount, 1);
  assert.equal(summariseLongTasks(metrics).blockingMs, 10);
  assert.equal(summariseLongTasks({ ...metrics, supported: false }).blockingMs, null);
  assert.throws(() => summariseLongTasks({ ...metrics, end: null }));
});

test('runner reports selected cases from inactive layers as skipped', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  // Execute the runner's actual selection block; a copied selector would miss wiring bugs.
  const block = source.slice(
    source.indexOf('const runLegacy ='),
    source.indexOf('const execution ='),
  );
  const skipped = runInNewContext(block + '; JSON.stringify(skipped)', {
    layer: 'engine',
    requestedCases: ['S08-corrupt', 'png-photo'],
    legacyCases: [{ name: 'png-photo' }],
    engineCases: [{ id: 'S08-corrupt' }],
    CODEC_CASE_ID: 'codec-view',
  });
  assert.deepEqual(JSON.parse(skipped), ['png-photo']);
});

test('application downloads require complete dimensions matching the fixed named cases', () => {
  assert.doesNotThrow(() => assertApplicationReport(applicationReport()));
  for (const dimensions of [
    undefined,
    null,
    [],
    new Array(2),
    [1600],
    [1600, 1200, 1],
    [0, 0],
    [-1, -1],
    [1.5, 2],
    [NaN, Infinity],
    ['1600', '1200'],
    [640, 480],
  ]) {
    const report = applicationReport();
    report.batch.outputs[0].dimensions = dimensions;
    report.batch.outputs[0].expected = dimensions;
    assert.throws(() => assertApplicationReport(report), /batch output validation/);
  }
  for (const field of ['dimensions', 'expected']) {
    const report = applicationReport();
    delete report.batch.outputs[0][field];
    assert.throws(() => assertApplicationReport(report), /batch output validation/);
  }
  const missingOutputs = applicationReport();
  missingOutputs.batch.outputs = new Array(2);
  assert.throws(() => assertApplicationReport(missingOutputs), /batch output validation/);
  const swapped = applicationReport();
  swapped.batch.outputs.reverse();
  assert.throws(() => assertApplicationReport(swapped), /batch output validation/);
  const wrongName = applicationReport();
  wrongName.batch.outputs[0].name = 'different.jpg';
  assert.throws(() => assertApplicationReport(wrongName), /batch output validation/);
});

test('corrupt fixture accepts only its exact preflight input failure, never infrastructure errors', () => {
  const spec = { id: 'S08-corrupt', mode: 'corrupt' };
  const good = {
    iteration: 0,
    status: 'error',
    errorName: 'Error',
    error: 'Failed to read image dimensions',
    attempts: [],
    actualEngine: null,
    fallback: false,
  };
  const validate = (sample) => validateEngineResult(spec, { samples: [sample] }, { repeats: 0 });
  assert.deepEqual(validate(good), []);
  for (const error of [
    'WebAssembly.instantiate(): invalid module',
    'Failed to load /wasm/mozjpeg_enc.wasm',
    'Worker decoder crashed',
    'Failed to read image dimensions: decoder crashed',
    'invalid runtime configuration',
    'could not read WASM',
  ]) {
    // Even an ordinary Error with a matching keyword is not an input classification.
    assert.ok(validate({ ...good, error }).length, error);
  }
  for (const change of [
    { errorName: 'RuntimeError' },
    { attempts: [{ engine: 'compat', status: 'error' }] },
    { attempts: undefined },
    { actualEngine: 'compat' },
    { fallback: true },
  ]) {
    assert.ok(validate({ ...good, ...change }).length, JSON.stringify(change));
  }
});
