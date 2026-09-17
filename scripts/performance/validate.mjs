/**
 * Pure validation of a run.mjs engine result against its selected case.
 *
 * Extracted so the acceptance runner cannot silently pass on wrong dimensions,
 * orientation, missing samples, mixed success/error samples, an incomplete
 * batch, a non-AbortError cancellation, or an unrelated error standing in for a
 * target rejection. Returns a list of human-readable failures; empty means pass.
 */

// S08-corrupt is a truncated JPEG rejected by readImageDimensions before any engine runs.
const CORRUPT_INPUT_ERROR = 'Failed to read image dimensions';

export const APPLICATION_BATCH_CASES = Object.freeze([
  Object.freeze({ name: 'batch-0.jpg', dimensions: Object.freeze([1600, 1200]) }),
  Object.freeze({ name: 'batch-1.jpg', dimensions: Object.freeze([800, 600]) }),
]);

function matchesBatchDimensions(value, expected) {
  // Both sides must exist and match the fixed positive-integer case, not each other.
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === expected[0] &&
    value[1] === expected[1]
  );
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

export function assertEngineResult(spec, result, options) {
  const failures = validateEngineResult(spec, result, options);
  if (failures.length > 0) {
    throw new Error(
      `Engine validation failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`,
    );
  }
}

export function validateEngineResult(spec, result, { repeats } = {}) {
  const failures = [];
  const fail = (message) => failures.push(`${spec.id}: ${message}`);
  const expectedIterations = Number.isInteger(repeats) ? repeats + 1 : null;

  if (!result || typeof result !== 'object') {
    fail('missing result object');
    return failures;
  }
  if (!Array.isArray(result.samples)) {
    fail('missing samples array');
    return failures;
  }
  const samples = result.samples;
  if (!samples.length || expectedIterations === null || samples.length !== expectedIterations) {
    fail(`expected ${expectedIterations} samples, got ${samples.length}`);
  }
  samples.forEach((sample, index) => {
    if (!sample || sample.iteration !== index) {
      fail(`sample ${index} has iteration ${sample?.iteration}`);
    }
  });

  if (samples.some((sample) => !sample || typeof sample !== 'object')) return failures;

  if (spec.mode === 'batch') {
    validateBatch(spec, samples, fail);
    return failures;
  }

  if (spec.mode === 'corrupt' || spec.mode === 'cancel' || spec.mode === 'target') {
    validateNegative(spec, samples, fail);
    return failures;
  }

  validatePositive(spec, samples, fail);

  if (spec.compareLegacy) validateParity(result.parity, fail);
  if (spec.rawParity) {
    if (result.rawParity?.supported !== true) fail('missing raw target comparison');
    validateParity(result.rawParity, fail, false);
  }
  return failures;
}

function validatePositive(spec, samples, fail) {
  for (const sample of samples) {
    if (sample.status !== 'ok') {
      fail(
        `iteration ${sample.iteration} status ${sample.status}${sample.error ? ` (${sample.error})` : ''}`,
      );
      continue;
    }
    if (!['compat', 'vips', 'animation'].includes(sample.actualEngine))
      fail(`iteration ${sample.iteration} invalid actualEngine`);
    if (
      sample.requestedEngine === 'compat' &&
      spec.mode !== 'animation' &&
      sample.actualEngine !== 'compat'
    )
      fail('Compat policy did not use Compat');
    if (!isPositiveInt(sample.width) || !isPositiveInt(sample.height))
      fail('invalid output dimensions');
    if (!isPositiveInt(sample.outputBytes)) {
      fail(`iteration ${sample.iteration} outputBytes ${sample.outputBytes}`);
    }
    if (!sample.outputSha256) fail(`iteration ${sample.iteration} missing output hash`);

    const expected =
      spec.expected ??
      (!spec.resize && spec.width && spec.height ? [spec.width, spec.height] : null);
    if (expected) {
      if (sample.width !== expected[0] || sample.height !== expected[1]) {
        fail(
          `iteration ${sample.iteration} dims ${sample.width}x${sample.height} != ${expected.join('x')}`,
        );
      }
      if (spec.expected && sample.dimensionsOk !== true) {
        fail(`iteration ${sample.iteration} dimensionsOk ${sample.dimensionsOk}`);
      }
    }
    if (spec.colorReference) {
      validateParity(sample.colorCheck, fail, false);
      if (
        !Number.isFinite(sample.colorCheck?.swatchMaxError) ||
        sample.colorCheck.swatchMaxError < 0 ||
        sample.colorCheck.swatchMaxError >= 12
      )
        fail('known color swatch error');
      if (sample.colorCheck?.profileSha256 !== spec.profileSha256)
        fail('color profile hash mismatch');
    }
    if (spec.orientation && sample.orientationOk !== true) {
      fail(`iteration ${sample.iteration} orientationOk ${sample.orientationOk}`);
    }
    if (spec.mode === 'animation' && sample.actualEngine !== 'animation') {
      fail(`iteration ${sample.iteration} engine ${sample.actualEngine} != animation`);
    }
  }
}

function validateNegative(spec, samples, fail) {
  if (samples.length === 0) {
    fail('negative case produced no samples');
    return;
  }
  for (const sample of samples) {
    if (spec.mode === 'cancel') {
      if (sample.status !== 'cancelled' || sample.errorName !== 'AbortError') {
        fail(
          `iteration ${sample.iteration} expected cancelled/AbortError, got ${sample.status}/${sample.errorName}`,
        );
      }
      if (
        !sample.cancelCheck?.loadStarts ||
        sample.cancelCheck.cleanup !== true ||
        !isPositiveInt(sample.cancelCheck.retry?.outputBytes)
      )
        fail('load cancellation/cleanup/retry evidence missing');
      continue;
    }
    if (spec.mode === 'target') {
      if (sample.status !== 'rejected') {
        fail(
          `iteration ${sample.iteration} expected safety rejection, got ${sample.status} (${sample.error})`,
        );
      }
      if (!Array.isArray(sample.attempts) || sample.attempts.length !== 0) {
        fail(`iteration ${sample.iteration} rejected target still attempted an engine`);
      }
      if (sample.error !== 'target: pixel limit')
        fail(`iteration ${sample.iteration} unexpected target rejection: ${sample.error}`);
      continue;
    }
    // corrupt input
    if (sample.status !== 'error') {
      fail(
        `iteration ${sample.iteration} expected input error, got ${sample.status} (${sample.error})`,
      );
    } else if (
      sample.errorName !== 'Error' ||
      sample.error !== CORRUPT_INPUT_ERROR ||
      !Array.isArray(sample.attempts) ||
      sample.attempts.length !== 0 ||
      sample.actualEngine !== null ||
      sample.fallback !== false
    ) {
      fail(`iteration ${sample.iteration} unexpected corrupt-input reason: ${sample.error}`);
    }
  }
}

function validateBatch(spec, samples, fail) {
  const expectedTasks = (spec.sources ?? []).map((source) => source.id);
  if (expectedTasks.length === 0) fail('batch has no expected tasks');
  for (const sample of samples) {
    if (sample.status !== 'ok') {
      fail(`batch iteration ${sample.iteration} status ${sample.status}`);
      continue;
    }
    if (!Number.isInteger(sample.concurrency) || sample.concurrency < 1) {
      fail(`batch iteration ${sample.iteration} concurrency ${sample.concurrency}`);
    }
    const results = Array.isArray(sample.results) ? sample.results : null;
    if (!results) {
      fail(`batch iteration ${sample.iteration} missing results`);
      continue;
    }
    const counts = new Map();
    for (const task of results) counts.set(task.id, (counts.get(task.id) ?? 0) + 1);
    for (const id of expectedTasks) {
      const count = counts.get(id) ?? 0;
      if (count !== 1) fail(`batch iteration ${sample.iteration} task ${id} count ${count}`);
    }
    for (const id of counts.keys()) {
      if (!expectedTasks.includes(id)) {
        fail(`batch iteration ${sample.iteration} unexpected task ${id}`);
      }
    }
    for (const task of results) {
      if (task.status !== 'ok') {
        fail(`batch iteration ${sample.iteration} task ${task.id} status ${task.status}`);
        continue;
      }
      const source = spec.sources.find((source) => source.id === task.id);
      if (source)
        validatePositive(
          source,
          [{ ...task, iteration: sample.iteration, actualEngine: task.engine }],
          fail,
        );
    }
  }
}

function validateParity(parity, fail, allowIdentical = true) {
  if (!parity || typeof parity !== 'object') {
    fail('missing required pixel comparison');
    return;
  }
  if (allowIdentical && parity.byteIdentical === true) return;
  if (parity.dimensionsMatch !== true) fail('parity dimensions mismatch');
  for (const [metric, ceiling] of Object.entries({
    rgbMae: 12,
    alphaMae: 3,
    blackRgbMae: 12,
    whiteRgbMae: 12,
  })) {
    if (!Number.isFinite(parity[metric]) || parity[metric] < 0 || parity[metric] >= ceiling) {
      fail(`parity ${metric} ${parity[metric]} must be finite, nonnegative and below ${ceiling}`);
    }
  }
}

/** Same final gate for the real application runner and negative-injection tests. */
export function assertApplicationReport(report) {
  const failures = [...report.failures];
  if (report.samples.length !== report.repeats + 1) failures.push('application sample count');
  for (const [index, sample] of report.samples.entries()) {
    if (sample.iteration !== index || sample.status !== 'ok')
      failures.push('application sample failed');
    if (!Array.isArray(sample.pageErrors) || sample.pageErrors.length)
      failures.push('application page errors');
    if (!Number.isFinite(sample.pageWindowMs) || sample.pageWindowMs < 0)
      failures.push('application timing missing');
  }
  const cancel = report.cancelRetry;
  if (cancel?.status !== 'ok') failures.push(`cancel/retry ${cancel?.status ?? 'missing'}`);
  if (!Array.isArray(cancel?.pageErrors) || cancel.pageErrors.length)
    failures.push('cancel/retry page errors');
  if (
    cancel?.noLateStalePublication !== true ||
    cancel?.doneAfterCancel !== cancel?.doneBeforeImport ||
    cancel?.doneAfterRetry !== cancel?.doneBeforeImport + 1
  )
    failures.push('cancel/retry terminal outcome');
  const batch = report.batch;
  if (batch?.status !== 'ok' || batch?.imported !== 2 || batch?.completed !== 2)
    failures.push('application batch incomplete');
  if (
    !Array.isArray(batch?.outputs) ||
    batch.outputs.length !== APPLICATION_BATCH_CASES.length ||
    APPLICATION_BATCH_CASES.some((spec, index) => {
      const output = batch.outputs[index];
      return (
        !isPositiveInt(output?.bytes) ||
        output.name !== spec.name ||
        !matchesBatchDimensions(output.dimensions, spec.dimensions) ||
        !matchesBatchDimensions(output.expected, spec.dimensions)
      );
    })
  )
    failures.push('application batch output validation');
  if (!Array.isArray(batch?.pageErrors) || batch.pageErrors.length)
    failures.push('application batch page errors');
  if (failures.length) throw new Error(`Application validation failed: ${failures.join('; ')}`);
}

/** Collect delivered entries against the frozen browser completion interval. */
export function summariseLongTasks(metrics) {
  if (
    !Number.isFinite(metrics.start) ||
    !Number.isFinite(metrics.end) ||
    metrics.end < metrics.start
  )
    throw new Error('Missing browser measurement interval');
  if (!metrics.supported)
    return {
      longTasksSupported: false,
      longTaskCount: null,
      longTaskMs: null,
      longTaskMaxMs: null,
      blockingMs: null,
      longTasks: null,
    };
  const relevant = metrics.longTasks.filter(
    (task) => task.startTime < metrics.end && task.startTime + task.duration > metrics.start,
  );
  return {
    longTasksSupported: true,
    longTaskCount: relevant.length,
    longTaskMs: relevant.reduce((sum, task) => sum + task.duration, 0),
    longTaskMaxMs: Math.max(0, ...relevant.map((task) => task.duration)),
    blockingMs: relevant.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
    longTasks: relevant.map((task) => ({
      start: task.startTime - metrics.start,
      duration: task.duration,
    })),
  };
}
