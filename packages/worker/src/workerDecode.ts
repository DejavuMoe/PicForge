/**
 * Decode and resize inside the encoding Worker, so a large photo never blocks the
 * page. The original Blob is structured-cloned, not transferred: the caller keeps
 * it as the retry source for the main-thread path.
 */

import type { ResizeOptions } from '@pic-forge/codecs';
import {
  drawScaled,
  resolveResizeGeometry,
  validateResizeOptions,
  validateResizeTarget,
  validateSourceDimensions,
  type DecodedImage,
  type DownscaleStrategy,
  type ResizeGeometry,
} from './imageProcessor';

/** This runtime cannot decode in a Worker at all; later tasks skip the attempt. */
export const WORKER_DECODE_UNSUPPORTED = 'Worker decode unsupported';
/** This file could not be decoded here; the main-thread decoder may still accept it. */
export const WORKER_DECODE_FAILED = 'Worker decode failed';

export interface WorkerDecodeHooks {
  onDecoded?: (size: { originalWidth: number; originalHeight: number }) => void;
  onResized?: () => void;
  downscale?: DownscaleStrategy;
}

function context(canvas: OffscreenCanvas, readback = false) {
  const ctx = canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error(`${WORKER_DECODE_UNSUPPORTED}: no OffscreenCanvas 2D context`);
  return ctx;
}

export async function decodeAndResizeInWorker(
  source: Blob,
  resize: ResizeOptions | undefined,
  hooks: WorkerDecodeHooks = {},
): Promise<DecodedImage> {
  const optionsError = validateResizeOptions(resize);
  if (optionsError) throw new Error(optionsError);
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
    throw new Error(`${WORKER_DECODE_UNSUPPORTED}: createImageBitmap/OffscreenCanvas missing`);
  // Probe before decoding: a context-less OffscreenCanvas (older WebKit) is a
  // runtime capability gap, not a problem with this file.
  const probe = new OffscreenCanvas(1, 1);
  context(probe);
  probe.width = 0;
  probe.height = 0;

  let bitmap: ImageBitmap;
  try {
    // Same orientation and colour handling as an <img>: EXIF applied, converted to sRGB.
    bitmap = await createImageBitmap(source, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
    });
  } catch (error) {
    // Undecodable data rejects with InvalidStateError; a TypeError means this
    // runtime rejects the decode options themselves.
    const kind = error instanceof TypeError ? WORKER_DECODE_UNSUPPORTED : WORKER_DECODE_FAILED;
    throw new Error(`${kind}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let canvas: OffscreenCanvas | undefined;
  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const sourceError = validateSourceDimensions(originalWidth, originalHeight);
    if (sourceError) throw new Error(sourceError);
    hooks.onDecoded?.({ originalWidth, originalHeight });

    const geometry: ResizeGeometry = resolveResizeGeometry(
      originalWidth,
      originalHeight,
      resize ?? {
        enabled: false,
        mode: 'absolute',
        maxWidth: originalWidth,
        maxHeight: originalHeight,
        percentage: 100,
        method: 'contain',
      },
    );
    const targetError = validateResizeTarget(geometry);
    if (targetError) throw new Error(targetError);

    canvas = new OffscreenCanvas(geometry.targetWidth, geometry.targetHeight);
    const ctx = context(canvas, true);
    drawScaled(
      ctx,
      bitmap,
      geometry,
      (width, height) => new OffscreenCanvas(width, height),
      hooks.downscale,
    );
    const imageData = ctx.getImageData(0, 0, geometry.targetWidth, geometry.targetHeight);
    hooks.onResized?.();
    return {
      data: imageData.data,
      width: geometry.targetWidth,
      height: geometry.targetHeight,
      originalWidth,
      originalHeight,
    };
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
