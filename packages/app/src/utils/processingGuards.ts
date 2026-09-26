import {
  DEFAULT_MAX_PIXELS,
  MAX_CANVAS_DIMENSION,
  PERMANENT_IMAGE_ERROR_PREFIX,
  getRecommendedWorkerPoolSize,
  inspectAnimation,
  resolveResizeGeometry,
  validateResizeOptions,
  validateResizeTarget,
} from '@pic-forge/worker';
import type { ResizeOptions } from '@pic-forge/codecs';

export { PERMANENT_IMAGE_ERROR_PREFIX };

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageSafetyLimits {
  maxDimension: number;
  maxPixels: number;
  maxDecodedBytes: number;
}

interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const BYTES_PER_PIXEL = 4;
const LOW_RESOURCE_MAX_PIXELS = 24_000_000;

/**
 * Maximum compression tasks in flight at once. On capable devices this matches
 * the encoder Worker pool so every Worker can be used; the shared memory budget
 * (resourceBudget.ts), not this count, keeps large images from running together.
 * Low-resource devices keep one task at a time.
 */
export function getMainPipelineConcurrency(device: DeviceHints = getNavigatorHints()): number {
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 8;

  if (cores <= 4 || memory <= 4) return 1;
  return getRecommendedWorkerPoolSize(cores);
}

export function getImageSafetyLimits(device: DeviceHints = getNavigatorHints()): ImageSafetyLimits {
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 8;
  const maxPixels = cores <= 4 || memory <= 4 ? LOW_RESOURCE_MAX_PIXELS : DEFAULT_MAX_PIXELS;

  return {
    maxDimension: MAX_CANVAS_DIMENSION,
    maxPixels,
    maxDecodedBytes: maxPixels * BYTES_PER_PIXEL,
  };
}

export function estimateDecodedBytes(dimensions: ImageDimensions): number {
  return dimensions.width * dimensions.height * BYTES_PER_PIXEL;
}

export function validateImageDimensions(
  dimensions: ImageDimensions,
  limits: ImageSafetyLimits = getImageSafetyLimits(),
): string | null {
  const { width, height } = dimensions;
  const pixels = width * height;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: could not read image dimensions.`;
  }

  if (width > limits.maxDimension || height > limits.maxDimension) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: ${width}x${height} is larger than the ${limits.maxDimension}px per-side canvas limit.`;
  }

  if (pixels > limits.maxPixels) {
    const megapixels = Math.round(pixels / 1_000_000);
    const limitMegapixels = Math.round(limits.maxPixels / 1_000_000);
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: ${megapixels}MP is above the ${limitMegapixels}MP limit for this device.`;
  }

  return null;
}

/**
 * Device-policy guard for the resize target. Runs before decode when the
 * controller already knows the normalized source dimensions. The engine still
 * enforces a final hard-ceiling guard at the allocation entry.
 */
export function validateImageTarget(
  source: ImageDimensions,
  resize: ResizeOptions | undefined,
  limits: ImageSafetyLimits = getImageSafetyLimits(),
): string | null {
  if (!resize?.enabled) return null;

  const optionsError = validateResizeOptions(resize);
  if (optionsError) return optionsError;

  const geometry = resolveResizeGeometry(source.width, source.height, resize);
  return validateResizeTarget(geometry, {
    maxDimension: limits.maxDimension,
    maxPixels: limits.maxPixels,
  });
}

/**
 * How an error should be handled:
 * - input: the source itself is unusable or out of bounds; never retried automatically.
 * - settings: caused by the current settings; reprocessed when the settings change.
 * - timeout: exceeded a watchdog; not repeated automatically, reprocessed when settings
 *   change (a smaller target or faster format may fit) and on explicit retry.
 * - runtime: engine/infrastructure failure; retried a bounded number of times.
 */
export type ImageErrorClass = 'input' | 'settings' | 'runtime' | 'timeout';

const SETTINGS_LIMIT_DETAILS = [
  ': target ',
  ': could not determine target dimensions',
  ': invalid resize ',
  ': unsupported resize ',
];

/**
 * Classify an engine or preflight error message. `phase` distinguishes an animation
 * limit found while reading the source (input) from one caused by the requested
 * output size during processing (settings).
 */
export function classifyImageError(
  error?: string,
  phase: 'preflight' | 'process' = 'process',
): ImageErrorClass {
  if (!error) return 'runtime';
  if (error.startsWith(PERMANENT_IMAGE_ERROR_PREFIX)) {
    const detail = error.slice(PERMANENT_IMAGE_ERROR_PREFIX.length);
    return SETTINGS_LIMIT_DETAILS.some((prefix) => detail.startsWith(prefix)) ? 'settings' : 'input';
  }
  if (error.startsWith('Animation: ')) {
    const code = error.slice('Animation: '.length);
    if (code === 'format' || code === 'settings') return 'settings';
    if (code === 'limit') return phase === 'preflight' ? 'input' : 'settings';
    if (code === 'timeout') return 'timeout';
    if (code === 'engine') return 'runtime';
    return 'input';
  }
  if (/^Task timed out after /.test(error)) return 'timeout';
  return 'runtime';
}

/** Error classes that a later settings change may resolve. */
export function isSettingsRecoverable(errorClass: ImageErrorClass): boolean {
  return errorClass === 'settings' || errorClass === 'timeout';
}

/** Whether an error must not be retried automatically. */
export function isPermanentImageError(error?: string): boolean {
  return !!error && classifyImageError(error) !== 'runtime';
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
  const animation = await inspectAnimation(file);
  if (animation) return { width: animation.width, height: animation.height };
  const url = URL.createObjectURL(file);

  try {
    const img = await loadImage(url);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fixed-count concurrency, used by the performance harness to replay batches.
 * The app's controller additionally applies the shared memory budget.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const safeLimit = Math.max(1, Math.floor(limit));
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, () => runNext());

  await Promise.all(runners);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to read image dimensions'));
    img.src = url;
  });
}

function getNavigatorHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {};

  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}
