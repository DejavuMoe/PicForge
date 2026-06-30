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
 * Load an image from a URL.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image`));
    img.src = url;
  });
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
  if (!options.enabled) {
    return { data, width, height };
  }

  let effectiveMaxWidth: number;
  let effectiveMaxHeight: number;

  if (options.mode === 'percentage') {
    const scale = options.percentage / 100;
    effectiveMaxWidth = Math.round(width * scale);
    effectiveMaxHeight = Math.round(height * scale);
  } else {
    effectiveMaxWidth = options.maxWidth;
    effectiveMaxHeight = options.maxHeight;
  }

  const geometry = calculateResizeGeometry(
    width,
    height,
    effectiveMaxWidth,
    effectiveMaxHeight,
    options.method,
  );
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
