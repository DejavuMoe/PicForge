/**
 * Core image processing pipeline — runs in the main thread.
 *
 * Uses WASM codecs (via @jsquash/*) for mozjpeg/webp/oxipng encoding.
 * Falls back to Canvas API for browser-native formats (browser-*).
 */

import type { ResizeOptions } from '@pic-forge/codecs';

export interface ResizeGeometry {
  targetWidth: number;
  targetHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Hard per-side canvas ceiling shared by the engine final guard. */
export const MAX_CANVAS_DIMENSION = 16_384;
/** Default total-pixel ceiling when no device policy is supplied. */
export const DEFAULT_MAX_PIXELS = 50_000_000;
/** Prefix that classifies an error as a permanent input/settings rejection. */
export const PERMANENT_IMAGE_ERROR_PREFIX = 'Image exceeds browser safety limit';

export interface ResizeTargetLimits {
  maxDimension: number;
  maxPixels: number;
}

const DEFAULT_RESIZE_TARGET_LIMITS: ResizeTargetLimits = {
  maxDimension: MAX_CANVAS_DIMENSION,
  maxPixels: DEFAULT_MAX_PIXELS,
};

/**
 * Decode an image file buffer into raw pixel data using Canvas API.
 */
export async function decodeImage(buffer: ArrayBuffer): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const blob = new Blob([buffer]);
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    if (
      !Number.isFinite(img.naturalWidth) ||
      !Number.isFinite(img.naturalHeight) ||
      img.naturalWidth <= 0 ||
      img.naturalHeight <= 0
    ) {
      throw new Error(`${PERMANENT_IMAGE_ERROR_PREFIX}: could not read image dimensions.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      data: imageData.data,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from a URL. Optionally abort an in-flight load.
 */
function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      img.src = '';
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load image`));
    };
    signal?.addEventListener('abort', abort, { once: true });
    img.src = url;
  });
}

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** EXIF-normalized source dimensions, before any resize. */
  originalWidth: number;
  originalHeight: number;
}

export interface DecodeAndResizeHooks {
  signal?: AbortSignal;
  /** Fired once the source image is loaded and normalized dimensions are known. */
  onDecoded?: () => void;
  /** Fired once the target RGBA has been read back from the target canvas. */
  onResized?: () => void;
}

/**
 * Decode the original Blob and draw it straight into the target-size canvas in
 * one pass. The source is never read back as a full-frame RGBA array and no
 * intermediate source canvas is allocated. Source crop and scale come from the
 * shared resolveResizeGeometry path; the target is validated before allocation.
 */
export async function decodeAndResizeImage(
  source: Blob,
  resize?: ResizeOptions,
  hooks: DecodeAndResizeHooks = {},
): Promise<DecodedImage> {
  const { signal, onDecoded, onResized } = hooks;
  signal?.throwIfAborted();
  const optionsError = validateResizeOptions(resize);
  if (optionsError) throw new Error(optionsError);
  const url = URL.createObjectURL(source);
  let canvas: HTMLCanvasElement | undefined;

  try {
    const img = await loadImage(url, signal);
    signal?.throwIfAborted();

    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;
    const sourceError = validateSourceDimensions(originalWidth, originalHeight);
    if (sourceError) throw new Error(sourceError);
    onDecoded?.();

    const geometry: ResizeGeometry = resize?.enabled
      ? resolveResizeGeometry(originalWidth, originalHeight, resize)
      : {
          targetWidth: originalWidth,
          targetHeight: originalHeight,
          sourceX: 0,
          sourceY: 0,
          sourceWidth: originalWidth,
          sourceHeight: originalHeight,
        };
    const targetError = validateResizeTarget(geometry);
    if (targetError) throw new Error(targetError);

    canvas = document.createElement('canvas');
    canvas.width = geometry.targetWidth;
    canvas.height = geometry.targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      geometry.sourceX,
      geometry.sourceY,
      geometry.sourceWidth,
      geometry.sourceHeight,
      0,
      0,
      geometry.targetWidth,
      geometry.targetHeight,
    );
    signal?.throwIfAborted();

    const imageData = ctx.getImageData(0, 0, geometry.targetWidth, geometry.targetHeight);
    onResized?.();
    return {
      data: imageData.data,
      width: geometry.targetWidth,
      height: geometry.targetHeight,
      originalWidth,
      originalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Resolve the resize geometry from source dimensions and settings, sharing the
 * same absolute/percentage rounding used by the engine allocation path.
 */
export function resolveResizeGeometry(
  srcWidth: number,
  srcHeight: number,
  options: ResizeOptions,
): ResizeGeometry {
  if (!options.enabled) {
    return {
      targetWidth: srcWidth,
      targetHeight: srcHeight,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
    };
  }

  let effectiveMaxWidth: number;
  let effectiveMaxHeight: number;

  if (options.mode === 'percentage') {
    const scale = options.percentage / 100;
    effectiveMaxWidth = Math.round(srcWidth * scale);
    effectiveMaxHeight = Math.round(srcHeight * scale);
  } else {
    effectiveMaxWidth = options.maxWidth;
    effectiveMaxHeight = options.maxHeight;
  }

  return calculateResizeGeometry(
    srcWidth,
    srcHeight,
    effectiveMaxWidth,
    effectiveMaxHeight,
    options.method,
  );
}

/**
 * Validate the resize settings that the active mode actually uses, before any
 * geometry helper can clamp or normalize an invalid value. Unused fields of an
 * inactive mode are not rejected.
 */
export function validateResizeOptions(resize?: ResizeOptions): string | null {
  if (!resize?.enabled) return null;
  if (resize.mode !== 'absolute' && resize.mode !== 'percentage') {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: unsupported resize mode.`;
  }
  if (!['contain', 'cover', 'stretch'].includes(resize.method)) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: unsupported resize method.`;
  }
  const active =
    resize.mode === 'percentage'
      ? [['percentage', resize.percentage]]
      : [
          ['maxWidth', resize.maxWidth],
          ['maxHeight', resize.maxHeight],
        ];
  for (const [name, value] of active) {
    if (!Number.isFinite(value as number) || (value as number) <= 0) {
      return `${PERMANENT_IMAGE_ERROR_PREFIX}: invalid resize ${name}.`;
    }
  }
  return null;
}

/**
 * Hard source-dimension guard at the decode/allocation entry. The application
 * controller applies tighter device policy; this covers direct engine calls and
 * normalized-dimension drift after the browser decode.
 */
export function validateSourceDimensions(
  width: number,
  height: number,
  limits: ResizeTargetLimits = DEFAULT_RESIZE_TARGET_LIMITS,
): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: could not read image dimensions.`;
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: ${width}x${height} is larger than the ${limits.maxDimension}px per-side canvas limit.`;
  }
  const pixels = width * height;
  if (pixels > limits.maxPixels) {
    const megapixels = Math.round(pixels / 1_000_000);
    const limitMegapixels = Math.round(limits.maxPixels / 1_000_000);
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: ${megapixels}MP is above the ${limitMegapixels}MP limit for this device.`;
  }
  return null;
}

/**
 * Final guard at the target-allocation entry. Rejects non-finite or oversized
 * targets before any Canvas/RGBA allocation. Callers with device policy may
 * pass tighter limits; the engine falls back to the hard canvas ceilings.
 */
export function validateResizeTarget(
  geometry: ResizeGeometry,
  limits: ResizeTargetLimits = DEFAULT_RESIZE_TARGET_LIMITS,
): string | null {
  const { targetWidth, targetHeight } = geometry;
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: could not determine target dimensions.`;
  }

  if (targetWidth > limits.maxDimension || targetHeight > limits.maxDimension) {
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: target ${targetWidth}x${targetHeight} is larger than the ${limits.maxDimension}px per-side canvas limit.`;
  }

  const pixels = targetWidth * targetHeight;
  if (pixels > limits.maxPixels) {
    const megapixels = Math.round(pixels / 1_000_000);
    const limitMegapixels = Math.round(limits.maxPixels / 1_000_000);
    return `${PERMANENT_IMAGE_ERROR_PREFIX}: target ${megapixels}MP is above the ${limitMegapixels}MP limit for this device.`;
  }

  return null;
}

/**
 * Resize image data according to the given options.
 */
export function resizeImage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ResizeOptions,
): { data: Uint8ClampedArray; width: number; height: number } {
  const optionsError = validateResizeOptions(options);
  if (optionsError) throw new Error(optionsError);
  const geometry = resolveResizeGeometry(width, height, options);
  const targetError = validateResizeTarget(geometry);
  if (targetError) throw new Error(targetError);
  const { targetWidth, targetHeight } = geometry;

  if (
    targetWidth === width &&
    targetHeight === height &&
    geometry.sourceX === 0 &&
    geometry.sourceY === 0 &&
    geometry.sourceWidth === width &&
    geometry.sourceHeight === height
  ) {
    return { data, width, height };
  }

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetWidth;
  dstCanvas.height = targetHeight;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(
    srcCanvas,
    geometry.sourceX,
    geometry.sourceY,
    geometry.sourceWidth,
    geometry.sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  const resultData = dstCtx.getImageData(0, 0, targetWidth, targetHeight);

  // Release canvas bitmap memory eagerly
  srcCanvas.width = 0;
  srcCanvas.height = 0;
  dstCanvas.width = 0;
  dstCanvas.height = 0;

  return {
    data: resultData.data,
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Calculate target dimensions and optional source crop based on resize method.
 */
export function calculateResizeGeometry(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
  method: 'contain' | 'cover' | 'stretch',
): ResizeGeometry {
  const targetMaxWidth = Math.max(1, Math.round(maxWidth));
  const targetMaxHeight = Math.max(1, Math.round(maxHeight));

  if (method === 'stretch') {
    return {
      targetWidth: targetMaxWidth,
      targetHeight: targetMaxHeight,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
    };
  }

  const aspectRatio = srcWidth / srcHeight;

  if (method === 'cover') {
    const targetAspectRatio = targetMaxWidth / targetMaxHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = srcWidth;
    let sourceHeight = srcHeight;

    if (aspectRatio > targetAspectRatio) {
      sourceWidth = Math.max(1, Math.round(srcHeight * targetAspectRatio));
      sourceX = Math.round((srcWidth - sourceWidth) / 2);
    } else {
      sourceHeight = Math.max(1, Math.round(srcWidth / targetAspectRatio));
      sourceY = Math.round((srcHeight - sourceHeight) / 2);
    }

    return {
      targetWidth: targetMaxWidth,
      targetHeight: targetMaxHeight,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    };
  }

  let targetWidth: number;
  let targetHeight: number;

  if (targetMaxWidth / targetMaxHeight < aspectRatio) {
    targetWidth = targetMaxWidth;
    targetHeight = Math.ceil(targetMaxWidth / aspectRatio);
  } else {
    targetHeight = targetMaxHeight;
    targetWidth = Math.ceil(targetMaxHeight * aspectRatio);
  }

  targetWidth = Math.min(targetWidth, srcWidth);
  targetHeight = Math.min(targetHeight, srcHeight);

  return {
    targetWidth,
    targetHeight,
    sourceX: 0,
    sourceY: 0,
    sourceWidth: srcWidth,
    sourceHeight: srcHeight,
  };
}
