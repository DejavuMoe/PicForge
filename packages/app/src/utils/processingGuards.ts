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
const DEFAULT_MAX_PIXELS = 50_000_000;
const MAX_CANVAS_DIMENSION = 16_384;

export const PERMANENT_IMAGE_ERROR_PREFIX = 'Image exceeds browser safety limit';

export function getMainPipelineConcurrency(device: DeviceHints = getNavigatorHints()): number {
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 8;

  if (cores <= 4 || memory <= 4) return 1;
  return 2;
}

export function getImageSafetyLimits(device: DeviceHints = getNavigatorHints()): ImageSafetyLimits {
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 8;
  const maxPixels = cores <= 4 || memory <= 4
    ? LOW_RESOURCE_MAX_PIXELS
    : DEFAULT_MAX_PIXELS;

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

export function isPermanentImageError(error?: string): boolean {
  return !!error?.startsWith(PERMANENT_IMAGE_ERROR_PREFIX);
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
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

  const runners = Array.from(
    { length: Math.min(safeLimit, items.length) },
    () => runNext(),
  );

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
