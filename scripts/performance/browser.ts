import { decodeImage, resizeImage, WorkerPool } from '../../packages/worker/src/index';
import {
  getImageSafetyLimits,
  readImageDimensions,
  validateImageDimensions,
} from '../../packages/app/src/utils/processingGuards';
import { DEFAULT_OPTIONS, type CompressSettings } from '../../packages/codecs/src/index';

// A synthetic workload, not a photographic quality corpus. No personal media.
export async function fixture(
  width: number,
  height: number,
  mime: string,
  kind: string,
  orientation = 1,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(width, height);
  let seed = 42;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const i = (y * width + x) * 4;
      const noise = (seed >>> 28) - 8;
      pixels.data[i] = (x * 255) / width + noise;
      pixels.data[i + 1] = (y * 255) / height + noise;
      pixels.data[i + 2] = 128 + 60 * Math.sin(x / 23) * Math.cos(y / 31) + noise;
      pixels.data[i + 3] = kind === 'alpha' ? Math.round((x * 255) / Math.max(1, width - 1)) : 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (kind === 'screenshot') {
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, width, height);
    for (let y = 20; y < height; y += 32) {
      ctx.fillStyle = y % 3 ? '#234' : '#69c';
      ctx.fillRect(20, y, width * (0.3 + (y % 7) / 10), 12);
    }
  }
  if (kind === 'orientation') {
    for (const [x, y, color] of [
      [0, 0, 'red'],
      [width / 2, 0, 'lime'],
      [0, height / 2, 'blue'],
      [width / 2, height / 2, 'yellow'],
    ] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width / 2, height / 2);
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(Error('Fixture encoding failed'))), mime, 0.9),
  );
  canvas.width = canvas.height = 0;
  if (blob.type !== mime) throw Error(`Browser cannot generate ${mime}`);
  if (kind !== 'orientation') return blob;
  // APP1 Exif: little-endian TIFF with one Orientation SHORT tag.
  const exif = new Uint8Array([
    255,
    225,
    0,
    34,
    69,
    120,
    105,
    102,
    0,
    0,
    73,
    73,
    42,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
    18,
    1,
    3,
    0,
    1,
    0,
    0,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return new Blob([jpeg.slice(0, 2), exif, jpeg.slice(2)], { type: mime });
}

function check(condition: boolean, message: string) {
  if (!condition) throw Error(message);
}

export async function run(
  spec: {
    name: string;
    width: number;
    height: number;
    mime: string;
    kind: string;
    orientation?: number;
    format?: string;
    resize?: string;
  },
  repeats: number,
) {
  const source = await fixture(spec.width, spec.height, spec.mime, spec.kind, spec.orientation);
  const inputBytes = await source.arrayBuffer();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', inputBytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const sourceInfo = { ...spec, inputBytes: source.size, sha256 };
  const settings = {
    outputFormat: spec.format ?? 'mozjpeg',
    quality: 75,
    advanced: {},
    resize: {
      enabled: !!spec.resize,
      mode: spec.resize === 'percentage' ? 'percentage' : 'absolute',
      maxWidth: 1920,
      maxHeight: 1080,
      percentage: 50,
      method: spec.resize === 'percentage' ? 'contain' : (spec.resize ?? 'contain'),
    },
  } as CompressSettings;
  const samples = [];
  const pool = new WorkerPool();
  try {
    for (let iteration = 0; iteration <= repeats; iteration++) {
      const longTasks: PerformanceEntry[] = [];
      const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = supported
        ? new PerformanceObserver((list) => longTasks.push(...list.getEntries()))
        : null;
      observer?.observe({ entryTypes: ['longtask'] });
      // Let fixture generation and the previous output validation leave the task queue.
      await new Promise((resolve) => setTimeout(resolve, 80));
      longTasks.length = 0;
      const started = performance.now();
      const dimensions = await readImageDimensions(
        new File([source], spec.name, { type: source.type }),
      );
      const preflightMs = performance.now() - started;
      const rejection = validateImageDimensions(dimensions);
      if (rejection) {
        observer?.disconnect();
        return {
          ...sourceInfo,
          settings,
          status: 'rejected',
          rejection,
          preflightMs,
          limits: getImageSafetyLimits(),
          samples: [],
        };
      }
      const readStart = performance.now();
      const buffer = await source.arrayBuffer();
      const readMs = performance.now() - readStart;
      const decodeStart = performance.now();
      const decoded = await decodeImage(buffer);
      const decodeMs = performance.now() - decodeStart;
      const resizeStart = performance.now();
      const resized = resizeImage(decoded.data, decoded.width, decoded.height, settings.resize!);
      const resizeMs = performance.now() - resizeStart;
      const copyStart = performance.now();
      const transfer = resized.data.buffer.slice(0) as ArrayBuffer;
      const copyMs = performance.now() - copyStart;
      const encodeStart = performance.now();
      const result = await new Promise<ArrayBuffer>((resolve, reject) =>
        pool.enqueue(spec.name, transfer, resized.width, resized.height, source.size, settings, {
          onResult: (_id, output) => resolve(output),
          onError: (_id, error) => reject(Error(error)),
        }),
      );
      const encodeMs = performance.now() - encodeStart;
      const ended = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 80));
      longTasks.push(...(observer?.takeRecords() ?? []));
      observer?.disconnect();
      const relevantTasks = longTasks.filter((t) => t.startTime >= started && t.startTime < ended);
      const sample = {
        iteration,
        temperature: iteration === 0 ? 'cold-worker' : 'warm',
        preflightMs,
        readMs,
        decodeMs,
        resizeMs,
        copyMs,
        encodeMs,
        totalMs: ended - started,
        outputBytes: result.byteLength,
        width: resized.width,
        height: resized.height,
        longTaskCount: supported ? relevantTasks.length : null,
        longTaskMs: supported ? relevantTasks.reduce((sum, t) => sum + t.duration, 0) : null,
        blockingMs: supported
          ? relevantTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)
          : null,
        rgbaWorkingSetLowerBoundBytes:
          (decoded.width * decoded.height + resized.width * resized.height) * 4,
        workerCount: pool.poolSize,
      };
      // Validation is outside the measurement window.
      const output = await decodeImage(result);
      check(
        output.width === resized.width && output.height === resized.height,
        `${spec.name}: output dimensions`,
      );
      check(result.byteLength > 0 && transfer.byteLength === 0, `${spec.name}: output/transfer`);
      if (spec.kind === 'orientation') {
        const swapped = spec.orientation === 6 || spec.orientation === 8;
        check(
          decoded.width === (swapped ? spec.height : spec.width) &&
            decoded.height === (swapped ? spec.width : spec.height),
          'EXIF dimensions',
        );
        const corner = [1, 3, 6, 8].indexOf(spec.orientation!);
        const expected = [
          [255, 0, 0],
          [255, 255, 0],
          [0, 0, 255],
          [0, 255, 0],
        ][corner];
        const pixel =
          (Math.floor(output.height / 4) * output.width + Math.floor(output.width / 4)) * 4;
        check(
          expected.every((v, i) => Math.abs(output.data[pixel + i] - v) < 35),
          'EXIF visual direction',
        );
      }
      if (spec.kind === 'alpha' && settings.outputFormat !== 'mozjpeg') {
        check(
          output.data[3] < 5 && output.data[(output.width - 1) * 4 + 3] > 250,
          'Alpha preservation',
        );
      }
      if (spec.kind === 'orientation') {
        check(!new TextDecoder('latin1').decode(result).includes('Exif'), 'EXIF stripped');
      }
      samples.push({
        ...sample,
        ...(spec.kind === 'alpha' ? { alphaProbe: [...output.data.slice(0, 4)] } : {}),
      });
    }
    return { ...sourceInfo, settings, status: 'ok', samples };
  } finally {
    pool.destroy();
  }
}

async function animationProbe() {
  // Two 1x1 frames (red, blue), 100 ms each. Literal GIF89a keeps this fixture dependency-free.
  const hex =
    '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b';
  const bytes = Uint8Array.from(hex.match(/../g)!, (value) => parseInt(value, 16));
  const decoded = await decodeImage(bytes.buffer);
  check(
    decoded.width === 1 && decoded.height === 1 && decoded.data[0] === 255 && decoded.data[2] === 0,
    'Animated GIF first-frame decode',
  );
  return { inputFrames: 2, decodedFrames: 1, firstPixel: [...decoded.data] };
}

Object.assign(window, { baseline: { run, fixture, animationProbe, defaults: DEFAULT_OPTIONS } });
