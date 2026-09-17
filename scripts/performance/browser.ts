import {
  buildEncoderOptions,
  calculateResizeGeometry,
  createCompatImageEngine,
  createImageProcessor,
  decodeImage,
  resizeImage,
  ImageEngineError,
  WorkerPool,
  type ImageEngine,
  type ImageProcessRequest,
  type ImageRuntimeCapabilities,
} from '../../packages/worker/src/index';
import { vipsImageEngine } from '../../packages/worker/src/vips/VipsImageEngine';
import { animationEngine } from '../../packages/app/src/animation/engine';
import {
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  readImageDimensions,
  runWithConcurrency,
  validateImageDimensions,
} from '../../packages/app/src/utils/processingGuards';
import {
  DEFAULT_OPTIONS,
  encodeImage,
  type CompressSettings,
  type ResizeOptions,
} from '../../packages/codecs/src/index';

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

// ---------------------------------------------------------------------------
// T00 real-engine measurement layer
//
// The legacy run() below keeps its own decode -> resize -> pool pipeline and
// historical fields. This layer drives the real createImageProcessor with the
// shared Compat/Vips/animation engines, records the actual engine and any
// fallback, and returns only small summaries (never large buffers) to Node.
// ---------------------------------------------------------------------------

// Literal GIF89a: two 1x1 frames (red, blue), 100 ms each. Same bytes animationProbe decodes.
const ANIMATED_GIF_HEX =
  '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b';

const engineCorpus = new Map<string, Promise<Blob>>();

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!, (value) => parseInt(value, 16));
}

function makeSvgFixture(width: number, height: number): Blob {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 2 2">` +
    '<rect width="1" height="1" x="0" y="0" fill="#e04030"/>' +
    '<rect width="1" height="1" x="1" y="0" fill="#30c040"/>' +
    '<rect width="1" height="1" x="0" y="1" fill="#3040e0"/>' +
    '<rect width="1" height="1" x="1" y="1" fill="#f0e020"/>' +
    '</svg>';
  return new Blob([svg], { type: 'image/svg+xml' });
}

function makeBmpFixture(width: number, height: number): Blob {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = new ArrayBuffer(54 + pixelBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, 54 + pixelBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = 54 + (height - 1 - y) * rowSize + x * 3;
      bytes[offset] = 0x30; // blue
      bytes[offset + 1] = x < width / 2 ? 0xc0 : 0x40; // green
      bytes[offset + 2] = 0xe0; // red
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

function makeStaticGifFixture(): Blob {
  const bytes = hexToBytes(ANIMATED_GIF_HEX);
  let seen = 0;
  let cut = bytes.length;
  for (let i = 0; i < bytes.length - 2; i += 1) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      seen += 1;
      if (seen === 2) {
        cut = i;
        break;
      }
    }
  }
  const single = new Uint8Array([...bytes.slice(0, cut), 0x3b]);
  return new Blob([single.buffer as ArrayBuffer], { type: 'image/gif' });
}

async function makeAvifFixture(width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#c03030';
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#30c030';
  ctx.fillRect(width / 2, 0, width / 2, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const settings = {
    outputFormat: 'avif',
    quality,
    advanced: {},
    resize: {
      enabled: false,
      mode: 'absolute',
      maxWidth: width,
      maxHeight: height,
      percentage: 100,
      method: 'contain',
    },
  } as CompressSettings;
  const bytes = await encodeImage('avif', data, width, height, buildEncoderOptions(settings));
  canvas.width = 0;
  canvas.height = 0;
  return new Blob([bytes], { type: 'image/avif' });
}

async function engineFixture(spec: any): Promise<Blob> {
  const cached = engineCorpus.get(spec.id);
  if (cached) return cached;
  const promise = (async () => {
    if (spec.fixtureBase64)
      return new Blob([Uint8Array.from(atob(spec.fixtureBase64), (c) => c.charCodeAt(0))], {
        type: spec.mime,
      });
    if (spec.mode === 'animation') {
      return new Blob([hexToBytes(ANIMATED_GIF_HEX).buffer as ArrayBuffer], {
        type: 'image/gif',
      });
    }
    if (spec.mode === 'corrupt') {
      return new Blob(
        [
          new Uint8Array([
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03,
            0x04, 0x05, 0x06, 0x07,
          ]).buffer,
        ],
        { type: 'image/jpeg' },
      );
    }
    if (spec.fixtureKind === 'svg') return makeSvgFixture(spec.width, spec.height);
    if (spec.fixtureKind === 'bmp') return makeBmpFixture(spec.width, spec.height);
    if (spec.fixtureKind === 'static-gif') return makeStaticGifFixture();
    if (spec.fixtureKind === 'avif-input') {
      return makeAvifFixture(spec.width, spec.height, spec.quality ?? 75);
    }
    const base = await fixture(
      spec.width,
      spec.height,
      spec.mime,
      spec.fixtureKind,
      spec.orientation,
    );
    return base;
  })();
  engineCorpus.set(spec.id, promise);
  return promise;
}

function engineSettings(spec: any): CompressSettings {
  const resize: ResizeOptions = spec.resize
    ? {
        enabled: true,
        mode: spec.resize.mode,
        maxWidth: spec.resize.maxWidth,
        maxHeight: spec.resize.maxHeight,
        percentage: spec.resize.percentage ?? 50,
        method: spec.resize.method,
      }
    : {
        enabled: false,
        mode: 'absolute',
        maxWidth: 1920,
        maxHeight: 1080,
        percentage: 50,
        method: 'contain',
      };
  return {
    outputFormat: spec.format ?? 'mozjpeg',
    quality: spec.quality ?? 75,
    advanced: { ...(spec.advanced ?? {}) },
    resize,
  } as CompressSettings;
}

/** Preflight-only geometry check so the harness never asks the engine to allocate an unsafe target. */
function localTargetError(
  width: number,
  height: number,
  resize: ResizeOptions | undefined,
  limits: { maxDimension: number; maxPixels: number },
): string | null {
  if (!resize?.enabled) return null;
  const geometry =
    resize.mode === 'percentage'
      ? calculateResizeGeometry(
          width,
          height,
          Math.round((width * resize.percentage) / 100),
          Math.round((height * resize.percentage) / 100),
          resize.method,
        )
      : calculateResizeGeometry(width, height, resize.maxWidth, resize.maxHeight, resize.method);
  if (
    !Number.isFinite(geometry.targetWidth) ||
    !Number.isFinite(geometry.targetHeight) ||
    geometry.targetWidth <= 0 ||
    geometry.targetHeight <= 0
  ) {
    return 'target: invalid dimensions';
  }
  if (geometry.targetWidth > limits.maxDimension || geometry.targetHeight > limits.maxDimension) {
    return 'target: per-side limit';
  }
  if (geometry.targetWidth * geometry.targetHeight > limits.maxPixels) {
    return 'target: pixel limit';
  }
  return null;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface EngineAttempt {
  id: string;
  engine: string;
  status: 'ok' | 'error' | 'aborted';
  error?: string;
  ms: number;
}

/**
 * Classify a long task by which engine phase interval it overlaps most. The
 * fused draw+getImageData is synchronous and starts at the onDecoded mark, so
 * start-time-only classification would mislabel it.
 */
function classifyPhase(offset: number, duration: number, marks: Record<number, number>): string {
  const decoded = marks[30];
  const resized = marks[50];
  const end = offset + duration;
  const decodeEnd = decoded ?? resized ?? offset;
  const drawStart = decoded ?? offset;
  const drawEnd = resized ?? drawStart;
  const encodeStart = resized ?? offset;
  const overlap = (start: number, stop: number) =>
    Math.max(0, Math.min(end, stop) - Math.max(offset, start));
  const candidates: Array<[string, number]> = [
    ['decode-load', overlap(0, decodeEnd)],
    ['draw-readback', overlap(drawStart, drawEnd)],
    ['encode-or-other', overlap(encodeStart, Number.POSITIVE_INFINITY)],
  ];
  return candidates.sort((a, b) => b[1] - a[1])[0][0];
}

function longTaskSummary(
  supported: boolean,
  relevant: PerformanceEntry[],
  started: number,
  marks: Record<number, number>,
) {
  if (!supported) {
    return {
      longTaskCount: null,
      longTaskMs: null,
      longTaskMaxMs: null,
      blockingMs: null,
      longTasks: null,
    };
  }
  return {
    longTaskCount: relevant.length,
    longTaskMs: Number(relevant.reduce((sum, t) => sum + t.duration, 0).toFixed(3)),
    longTaskMaxMs: relevant.length
      ? Number(Math.max(...relevant.map((t) => t.duration)).toFixed(3))
      : 0,
    blockingMs: Number(
      relevant.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0).toFixed(3),
    ),
    longTasks: relevant.map((t) => ({
      startTime: Number((t.startTime - started).toFixed(3)),
      duration: Number(t.duration.toFixed(3)),
      phase: classifyPhase(t.startTime - started, t.duration, marks),
    })),
  };
}

function trackEngine(
  engine: ImageEngine,
  attempts: EngineAttempt[],
  forceRuntimeFail = false,
): ImageEngine {
  let forced = false;
  return {
    kind: engine.kind,
    supports: (request: ImageProcessRequest, capabilities: ImageRuntimeCapabilities) =>
      engine.supports(request, capabilities),
    process: async (request: ImageProcessRequest, signal?: AbortSignal) => {
      if (forceRuntimeFail && !forced) {
        forced = true;
        attempts.push({
          id: request.id,
          engine: engine.kind,
          status: 'error',
          error: 'forced runtime fault (harness fallback self-test)',
          ms: 0,
        });
        throw new ImageEngineError('forced runtime fault (harness fallback self-test)', 'runtime');
      }
      const started = performance.now();
      try {
        const result = await engine.process(request, signal);
        attempts.push({
          id: request.id,
          engine: engine.kind,
          status: 'ok',
          ms: performance.now() - started,
        });
        return result;
      } catch (error) {
        const name = error instanceof Error ? error.name : 'Error';
        attempts.push({
          id: request.id,
          engine: engine.kind,
          status: name === 'AbortError' ? 'aborted' : 'error',
          error: error instanceof Error ? error.message : String(error),
          ms: performance.now() - started,
        });
        throw error;
      }
    },
  };
}

function observeLongTasks() {
  const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  const entries: PerformanceEntry[] = [];
  const observer = supported
    ? new PerformanceObserver((list) => entries.push(...list.getEntries()))
    : null;
  observer?.observe({ entryTypes: ['longtask'] });
  return {
    supported,
    entries,
    takeRecords: () => observer?.takeRecords() ?? [],
    disconnect: () => observer?.disconnect(),
  };
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function legacyPipeline(
  source: Blob,
  settings: CompressSettings,
  pool: WorkerPool,
  id: string,
): Promise<ArrayBuffer> {
  const decoded = await decodeImage(await source.arrayBuffer());
  const resized = settings.resize?.enabled
    ? resizeImage(decoded.data, decoded.width, decoded.height, settings.resize)
    : decoded;
  const transfer = resized.data.buffer.slice(0) as ArrayBuffer;
  return new Promise<ArrayBuffer>((resolve, reject) =>
    pool.enqueue(id, transfer, resized.width, resized.height, source.size, settings, {
      onResult: (_id, output) => resolve(output),
      onError: (_id, error) => reject(new Error(error)),
    }),
  );
}

function pixelStats(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number) {
  const length = Math.min(a.length, b.length);
  let rgbSum = 0;
  let rgbMax = 0;
  let alphaSum = 0;
  let pixels = 0;
  let visibleRgbSum = 0;
  let visibleChannels = 0;
  // Visible error after compositing each side over black and over white. This
  // measures what a viewer sees instead of the raw hidden RGB under alpha.
  let blackSum = 0;
  let whiteSum = 0;
  let edgeBlackSum = 0;
  let edgeWhiteSum = 0;
  let edgeChannels = 0;
  const edge = Math.max(1, Math.floor(Math.min(width, height) * 0.05));
  const inEdge = (index: number) => {
    if (width <= 0) return false;
    const x = (index / 4) % width;
    const y = Math.floor(index / 4 / width);
    return x < edge || x >= width - edge || y < edge || y >= height - edge;
  };
  for (let i = 0; i + 3 < length; i += 4) {
    const alphaA = a[i + 3] / 255;
    const alphaB = b[i + 3] / 255;
    for (let c = 0; c < 3; c += 1) {
      const diff = Math.abs(a[i + c] - b[i + c]);
      rgbSum += diff;
      if (diff > rgbMax) rgbMax = diff;
      if (a[i + 3] > 0 || b[i + 3] > 0) {
        visibleRgbSum += diff;
        visibleChannels += 1;
      }
      const blackDiff = Math.abs(a[i + c] * alphaA - b[i + c] * alphaB);
      const whiteDiff = Math.abs(
        a[i + c] * alphaA + 255 * (1 - alphaA) - (b[i + c] * alphaB + 255 * (1 - alphaB)),
      );
      blackSum += blackDiff;
      whiteSum += whiteDiff;
      if (inEdge(i)) {
        edgeBlackSum += blackDiff;
        edgeWhiteSum += whiteDiff;
        edgeChannels += 1;
      }
    }
    alphaSum += Math.abs(a[i + 3] - b[i + 3]);
    pixels += 1;
  }
  const channels = pixels * 3;
  return {
    pixels,
    rgbMae: pixels ? Number((rgbSum / channels).toFixed(4)) : null,
    visibleRgbMae: visibleChannels ? Number((visibleRgbSum / visibleChannels).toFixed(4)) : null,
    rgbMax,
    alphaMae: pixels ? Number((alphaSum / pixels).toFixed(4)) : null,
    blackRgbMae: pixels ? Number((blackSum / channels).toFixed(4)) : null,
    whiteRgbMae: pixels ? Number((whiteSum / channels).toFixed(4)) : null,
    edgeBlackRgbMae: edgeChannels ? Number((edgeBlackSum / edgeChannels).toFixed(4)) : null,
    edgeWhiteRgbMae: edgeChannels ? Number((edgeWhiteSum / edgeChannels).toFixed(4)) : null,
    edgePixels: edge,
  };
}

function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

async function compareLegacy(
  engineBuffer: ArrayBuffer,
  source: Blob,
  settings: CompressSettings,
  pool: WorkerPool,
  spec: any,
): Promise<Record<string, unknown>> {
  const legacy = await legacyPipeline(source, settings, pool, spec.id + '-legacy');
  const result: Record<string, unknown> = {
    legacyBytes: legacy.byteLength,
    engineBytes: engineBuffer.byteLength,
    byteIdentical: bytesEqual(new Uint8Array(legacy), new Uint8Array(engineBuffer)),
  };
  if (!result.byteIdentical) {
    const engineDecoded = await decodeImage(engineBuffer);
    const legacyDecoded = await decodeImage(legacy);
    result.dimensionsMatch =
      engineDecoded.width === legacyDecoded.width && engineDecoded.height === legacyDecoded.height;
    Object.assign(
      result,
      pixelStats(engineDecoded.data, legacyDecoded.data, engineDecoded.width, engineDecoded.height),
    );
  }
  return result;
}

/**
 * Unencoded quality comparison of the fused target pixels against the
 * legacy decode+resize pixels. The shared card operation is not copied into the
 * baseline; the dynamic import degrades to {supported:false} when the function
 * is absent. A requested rawParity gate requires support and finite quality metrics.
 */
async function rawTargetParity(source: Blob, resize: ResizeOptions | undefined) {
  const module = (await import('../../packages/worker/src/imageProcessor')) as Record<
    string,
    unknown
  >;
  if (typeof module.decodeAndResizeImage !== 'function') return { supported: false };
  const fused = await (
    module.decodeAndResizeImage as (
      source: Blob,
      resize?: ResizeOptions,
    ) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>
  )(source, resize);
  const decoded = await decodeImage(await source.arrayBuffer());
  const legacy = resize?.enabled
    ? resizeImage(decoded.data, decoded.width, decoded.height, resize)
    : decoded;
  return {
    supported: true,
    fusedDimensions: [fused.width, fused.height],
    legacyDimensions: [legacy.width, legacy.height],
    dimensionsMatch: fused.width === legacy.width && fused.height === legacy.height,
    ...pixelStats(fused.data, legacy.data, fused.width, fused.height),
  };
}

/** Exercise the real Image load listener, then retry the unchanged source Blob. */
async function cancelDuringImageLoad(
  processor: ReturnType<typeof createImageProcessor>,
  request: ImageProcessRequest,
) {
  const controller = new AbortController();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const urls = new Set<string>();
  const images: HTMLImageElement[] = [];
  let caught: unknown;
  URL.createObjectURL = (blob) => {
    const url = create.call(URL, blob);
    urls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    urls.delete(url);
    revoke.call(URL, url);
  };
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor,
    set(value: string) {
      descriptor.set!.call(this, value);
      if (value.startsWith('blob:')) {
        images.push(this);
        // The native src setter has started loading; abort before its load event.
        queueMicrotask(() => controller.abort());
      }
    },
  });
  try {
    await processor.process(request, controller.signal, 'compat');
  } catch (error) {
    caught = error;
  } finally {
    Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor);
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
  if (!(caught instanceof Error) || caught.name !== 'AbortError')
    throw caught ?? new Error('Load cancellation unexpectedly completed');
  const cleanup =
    urls.size === 0 &&
    images.every(
      (img) => img.onload === null && img.onerror === null && img.getAttribute('src') === '',
    );
  const retry = await processor.process(
    { ...request, id: request.id + '-retry', onProgress: undefined },
    undefined,
    'compat',
  );
  return {
    loadStarts: images.length,
    cleanup,
    retry: { width: retry.width, height: retry.height, outputBytes: retry.buffer.byteLength },
  };
}

export async function engineRun(
  spec: any,
  options: { repeats: number; policy?: string; forceVipsRuntimeFail?: boolean },
) {
  const repeats = options.repeats;
  const policy = (options.policy ?? 'auto') as 'auto' | 'compat' | 'vips';
  const limits = getImageSafetyLimits();
  const pool = new WorkerPool();
  const attempts: EngineAttempt[] = [];
  const processor = createImageProcessor(
    trackEngine(
      createCompatImageEngine(() => pool),
      attempts,
    ),
    trackEngine(vipsImageEngine, attempts, options.forceVipsRuntimeFail === true),
    trackEngine(animationEngine, attempts),
  );

  try {
    if (spec.mode === 'batch') {
      return await runEngineBatch(spec, {
        repeats,
        policy,
        pool,
        processor,
        limits,
        base: {
          id: spec.id,
          mode: spec.mode,
          sources: (spec.sources as any[]).map((source) => source.id),
        },
        attempts,
      });
    }

    const source = await engineFixture(spec);
    const sha256 = await sha256Hex(await source.arrayBuffer());
    const settings = engineSettings(spec);
    const base = { id: spec.id, mode: spec.mode, inputBytes: source.size, sha256, settings };

    const samples: any[] = [];
    let lastEngineBuffer: ArrayBuffer | null = null;

    for (let iteration = 0; iteration <= repeats; iteration += 1) {
      attempts.length = 0;
      const longTasks = observeLongTasks();
      await settle(80);
      longTasks.entries.length = 0;
      const started = performance.now();
      const progressMarks: Record<number, number> = {};
      const recordProgress = (value: number) => {
        if (progressMarks[value] === undefined) progressMarks[value] = performance.now() - started;
      };
      const file = new File([source], spec.id, { type: source.type });
      let status: 'ok' | 'error' | 'rejected' | 'cancelled' = 'ok';
      let errorMessage: string | undefined;
      let errorName: string | null = null;
      let dims: { width: number; height: number } | undefined;
      let result: any;
      let preflightMs = 0;
      let cancelCheck: Awaited<ReturnType<typeof cancelDuringImageLoad>> | null = null;

      try {
        if (spec.mode === 'cancel') {
          cancelCheck = await cancelDuringImageLoad(processor, {
            id: spec.id,
            source: file,
            settings,
            onProgress: recordProgress,
          });
          status = 'cancelled';
          errorName = 'AbortError';
        } else {
          dims = await readImageDimensions(file);
          preflightMs = performance.now() - started;
          const sourceError = validateImageDimensions(dims, limits);
          const targetError = localTargetError(dims.width, dims.height, settings.resize, limits);
          if (sourceError || targetError) {
            status = 'rejected';
            errorMessage = sourceError ?? targetError ?? undefined;
          } else {
            result = await processor.process(
              { id: spec.id, source: file, settings, onProgress: recordProgress },
              undefined,
              policy,
            );
          }
        }
      } catch (error) {
        errorName = error instanceof Error ? error.name : typeof error;
        status = errorName === 'AbortError' ? 'cancelled' : 'error';
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      const ended = performance.now();
      await settle(80);
      longTasks.entries.push(...longTasks.takeRecords());
      longTasks.disconnect();
      const relevant = longTasks.entries.filter(
        (t) => t.startTime < ended && t.startTime + t.duration > started,
      );
      const attemptsThis = attempts.filter((attempt) => attempt.id === spec.id);
      const actualEngine = result?.engine ?? null;
      const fellBack =
        attemptsThis.some((a) => a.engine === 'vips' && a.status === 'error') &&
        actualEngine === 'compat';
      if (status === 'ok' && result?.buffer) lastEngineBuffer = result.buffer;

      const sample: any = {
        iteration,
        temperature: iteration === 0 ? 'cold-worker' : 'warm',
        status,
        error: errorMessage ?? null,
        errorName,
        cancelCheck,
        requestedEngine: policy,
        actualEngine,
        fallback: fellBack,
        attempts: attemptsThis,
        preflightMs,
        processMs: status === 'ok' ? Number((ended - started - preflightMs).toFixed(3)) : null,
        totalMs: Number((ended - started).toFixed(3)),
        outputBytes: result?.buffer?.byteLength ?? null,
        // Hashing runs after the processing window; it is not part of totalMs.
        outputSha256: result?.buffer ? await sha256Hex(result.buffer) : null,
        width: result?.width ?? null,
        height: result?.height ?? null,
        originalWidth: result?.originalWidth ?? dims?.width ?? null,
        originalHeight: result?.originalHeight ?? dims?.height ?? null,
        progressMarks,
        ...longTaskSummary(longTasks.supported, relevant, started, progressMarks),
      };
      if (spec.expected) {
        sample.expected = spec.expected;
        sample.dimensionsOk =
          !!result && result.width === spec.expected[0] && result.height === spec.expected[1];
      }
      if (spec.colorReference && result?.buffer) {
        const decoded = await decodeImage(result.buffer);
        const reference = Uint8ClampedArray.from(atob(spec.referenceRgbaBase64), (c) =>
          c.charCodeAt(0),
        );
        const swatchErrors: number[] = [];
        for (const y of [12, 36])
          for (const x of [16, 48])
            for (let channel = 0; channel < 3; channel++) {
              const offset = (y * 64 + x) * 4 + channel;
              swatchErrors.push(Math.abs(decoded.data[offset] - reference[offset]));
            }
        sample.colorCheck = {
          swatchMaxError: Math.max(...swatchErrors),
          ...pixelStats(decoded.data, reference, decoded.width, decoded.height),
          dimensionsMatch:
            decoded.width === spec.expected[0] &&
            decoded.height === spec.expected[1] &&
            reference.length === decoded.data.length,
          profileSha256: spec.embeddedProfileSha256,
          referenceSha256: spec.referenceSha256,
          referenceTool: spec.referenceTool,
        };
      }
      if (spec.id === 'S05' && result?.buffer) {
        const decoded = await decodeImage(result.buffer);
        sample.alphaProbe = [...decoded.data.slice(0, 4)];
      }
      if (spec.orientation && result?.buffer) {
        const decoded = await decodeImage(result.buffer);
        const corner = [1, 3, 6, 8].indexOf(spec.orientation);
        const expected = [
          [255, 0, 0],
          [255, 255, 0],
          [0, 0, 255],
          [0, 255, 0],
        ][corner];
        const pixel =
          (Math.floor(decoded.height / 4) * decoded.width + Math.floor(decoded.width / 4)) * 4;
        sample.normalizedOriginal = [result.originalWidth, result.originalHeight];
        sample.orientationOk =
          !!expected && expected.every((v, i) => Math.abs(decoded.data[pixel + i] - v) < 35);
      }
      samples.push(sample);
    }

    let parity: Record<string, unknown> | null = null;
    if (spec.compareLegacy && lastEngineBuffer) {
      parity = await compareLegacy(lastEngineBuffer, source, settings, pool, spec);
    }
    let rawParity: Record<string, unknown> | null = null;
    if (spec.rawParity) {
      rawParity = await rawTargetParity(source, settings.resize);
    }

    const outerStatus = samples.some((s) => s.status === 'ok')
      ? 'ok'
      : (samples[samples.length - 1]?.status ?? 'error');
    return {
      ...base,
      mode: spec.mode,
      policy,
      repeats,
      expected: spec.expected ?? null,
      orientation: spec.orientation ?? null,
      status: outerStatus,
      samples,
      parity,
      rawParity,
    };
  } finally {
    pool.destroy();
  }
}

async function runEngineBatch(
  spec: any,
  options: {
    repeats: number;
    policy: 'auto' | 'compat' | 'vips';
    pool: WorkerPool;
    processor: ReturnType<typeof createImageProcessor>;
    limits: ReturnType<typeof getImageSafetyLimits>;
    base: Record<string, unknown>;
    attempts: EngineAttempt[];
  },
) {
  const { repeats, policy, limits, base, attempts, processor } = options;
  const prepared = [];
  for (const item of spec.sources as any[]) {
    const blob = await engineFixture(item);
    prepared.push({
      spec: item,
      file: new File([blob], item.id, { type: blob.type }),
      settings: engineSettings(item),
      sha256: await sha256Hex(await blob.arrayBuffer()),
    });
  }
  const samples: any[] = [];
  const concurrency = getMainPipelineConcurrency();

  for (let iteration = 0; iteration <= repeats; iteration += 1) {
    attempts.length = 0;
    const longTasks = observeLongTasks();
    await settle(80);
    longTasks.entries.length = 0;
    const started = performance.now();
    const results: any[] = [];
    let firstResultMs: number | null = null;

    await runWithConcurrency(prepared, concurrency, async (item) => {
      try {
        const dims = await readImageDimensions(item.file);
        const sourceError = validateImageDimensions(dims, limits);
        const targetError = localTargetError(dims.width, dims.height, item.settings.resize, limits);
        if (sourceError || targetError) {
          results.push({
            id: item.spec.id,
            status: 'rejected',
            error: sourceError ?? targetError,
            attempts: [],
          });
          return;
        }
        const result = await processor.process(
          { id: item.spec.id, source: item.file, settings: item.settings, onProgress: () => {} },
          undefined,
          policy,
        );
        if (firstResultMs === null) firstResultMs = performance.now() - started;
        // Attribute attempts by request id, never by a shared-array index range.
        results.push({
          id: item.spec.id,
          status: 'ok',
          engine: result.engine,
          requestedEngine: policy,
          width: result.width,
          height: result.height,
          dimensionsOk:
            !item.spec.expected ||
            (result.width === item.spec.expected[0] && result.height === item.spec.expected[1]),
          outputBytes: result.buffer.byteLength,
          buffer: result.buffer,
          attempts: attempts.filter((attempt) => attempt.id === item.spec.id),
        });
      } catch (error) {
        results.push({
          id: item.spec.id,
          status: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'error',
          error: error instanceof Error ? error.message : String(error),
          attempts: attempts.filter((attempt) => attempt.id === item.spec.id),
        });
      }
    });

    const ended = performance.now();
    // Hash after the processing window and slot release; validation is separate.
    const validationStart = performance.now();
    for (const task of results) {
      if (task.status === 'ok' && task.buffer) {
        task.outputSha256 = await sha256Hex(task.buffer);
        delete task.buffer;
      }
    }
    const validationMs = Number((performance.now() - validationStart).toFixed(3));
    await settle(80);
    longTasks.entries.push(...longTasks.takeRecords());
    longTasks.disconnect();
    const relevant = longTasks.entries.filter(
      (t) => t.startTime < ended && t.startTime + t.duration > started,
    );
    samples.push({
      iteration,
      temperature: iteration === 0 ? 'cold-worker' : 'warm',
      status: results.every((r) => r.status === 'ok') ? 'ok' : 'error',
      concurrency,
      firstResultMs,
      totalMs: Number((ended - started).toFixed(3)),
      validationMs,
      results,
      ...longTaskSummary(longTasks.supported, relevant, started, {}),
    });
  }

  return {
    ...base,
    mode: 'batch',
    policy,
    repeats,
    expectedTasks: (spec.sources ?? []).map((source: any) => source.id),
    inputs: prepared.map((item) => ({
      id: item.spec.id,
      sha256: item.sha256,
      settings: item.settings,
    })),
    status: samples.some((s) => s.status === 'ok') ? 'ok' : 'error',
    samples,
  };
}

/**
 * Real-WASM regression through the exported shared encodeImage entry. Each view
 * shape is encoded directly and against an explicit copy of its visible bytes;
 * output bytes, decoded colour/dimensions, input immutability and consecutive
 * encode stability are compared. This catches the AVIF backing-buffer subview
 * defect that the upstream-module test cannot see.
 */
export async function codecViewCheck() {
  const size = 16;
  const pixels = size * size * 4;
  const fill = (target: Uint8ClampedArray, offset: number, color: number[]) => {
    for (let i = offset; i < offset + pixels; i += 4) {
      target[i] = color[0];
      target[i + 1] = color[1];
      target[i + 2] = color[2];
      target[i + 3] = color[3];
    }
  };
  const full = new Uint8ClampedArray(pixels);
  fill(full, 0, [255, 0, 0, 255]);
  const offsetBacking = new Uint8ClampedArray(pixels * 2);
  fill(offsetBacking, 0, [0, 255, 0, 255]);
  fill(offsetBacking, pixels, [255, 0, 0, 255]);
  const shortBacking = new Uint8ClampedArray(pixels * 2);
  fill(shortBacking, 0, [255, 0, 0, 255]);
  fill(shortBacking, pixels, [0, 0, 255, 255]);
  const shapes: Array<{ name: string; view: Uint8ClampedArray }> = [
    { name: 'full', view: full },
    { name: 'offset', view: offsetBacking.subarray(pixels) },
    { name: 'offset-zero-short', view: shortBacking.subarray(0, pixels) },
  ];
  const sharedSupported = typeof SharedArrayBuffer !== 'undefined';
  if (sharedSupported) {
    const shared = new Uint8ClampedArray(new SharedArrayBuffer(pixels));
    fill(shared, 0, [255, 0, 0, 255]);
    shapes.push({ name: 'shared-full', view: shared });
  }
  const resizable = Reflect.construct(ArrayBuffer, [pixels, { maxByteLength: pixels * 2 }]);
  const resizableSupported = resizable.resizable === true;
  if (resizableSupported) {
    const view = new Uint8ClampedArray(resizable);
    fill(view, 0, [255, 0, 0, 255]);
    shapes.push({ name: 'resizable-full', view });
  }
  const results: any[] = [];
  for (const codec of ['mozjpeg', 'webp', 'avif', 'oxipng']) {
    const settings = {
      outputFormat: codec,
      quality: 75,
      advanced: {},
      resize: {
        enabled: false,
        mode: 'absolute',
        maxWidth: size,
        maxHeight: size,
        percentage: 100,
        method: 'contain',
      },
    } as CompressSettings;
    const options = buildEncoderOptions(settings);
    for (const shape of shapes) {
      const before = new Uint8ClampedArray(shape.view);
      const reference = new Uint8ClampedArray(shape.view); // explicit visible-byte copy
      const directBytes = await encodeImage(codec, shape.view, size, size, options);
      const referenceBytes = await encodeImage(codec, reference, size, size, options);
      const byteEqual = bytesEqual(new Uint8Array(directBytes), new Uint8Array(referenceBytes));
      const inputUnchanged = bytesEqual(new Uint8ClampedArray(shape.view), before);
      const again = await encodeImage(codec, shape.view, size, size, options);
      const stable = bytesEqual(new Uint8Array(again), new Uint8Array(directBytes));

      let decodeSupported = true;
      let directPixel: number[] | null = null;
      let referencePixel: number[] | null = null;
      let dimsOk = false;
      let pixelEqual = false;
      try {
        const direct = await decodeImage(directBytes);
        const ref = await decodeImage(referenceBytes);
        directPixel = [...direct.data.slice(0, 4)];
        referencePixel = [...ref.data.slice(0, 4)];
        dimsOk =
          direct.width === size &&
          direct.height === size &&
          ref.width === size &&
          ref.height === size;
        pixelEqual = directPixel.every((v, i) => Math.abs(v - referencePixel![i]) <= 2);
      } catch {
        decodeSupported = false;
      }

      const pass = byteEqual && inputUnchanged && stable && decodeSupported && dimsOk && pixelEqual;
      results.push({
        codec,
        shape: shape.name,
        pass,
        byteEqual,
        inputUnchanged,
        stable,
        decodeSupported,
        dimsOk,
        pixelEqual,
        directPixel,
        referencePixel,
        directBytes: directBytes.byteLength,
        referenceBytes: referenceBytes.byteLength,
      });
    }
  }
  return {
    size,
    sharedSupported,
    resizableSupported,
    results,
    pass: results.every((result) => result.pass),
    blocked: sharedSupported ? [] : ['SharedArrayBuffer unavailable'],
  };
}

/** Dispose the shared Vips qualification session. Only call when no Vips task is active. */
export function disposeVips() {
  vipsImageEngine.dispose();
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

Object.assign(window, {
  baseline: {
    run,
    fixture,
    animationProbe,
    engineRun,
    codecViewCheck,
    disposeVips,
    defaults: DEFAULT_OPTIONS,
  },
});
