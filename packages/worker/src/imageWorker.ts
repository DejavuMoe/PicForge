/**
 * Web Worker for WASM image encoding.
 *
 * Receives pixel data from main thread, encodes using WASM codec, returns result.
 * Decoding and resizing happen on the main thread (Canvas API).
 */

import { encodeImage } from '@pic-forge/codecs';
import { DEFAULT_OPTIONS } from '@pic-forge/codecs';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type !== 'task') return;

  const { id, pixelBuffer, width, height, originalSize, settings } = payload;

  try {
    // Report progress: starting encoding
    self.postMessage({ type: 'progress', payload: { id, progress: 60 } });

    // Build encoder options
    const defaults = DEFAULT_OPTIONS[settings.outputFormat as keyof typeof DEFAULT_OPTIONS];
    let encoderOptions: Record<string, any>;

    if (settings.outputFormat === 'avif') {
      const cqLevel = Math.round((settings.quality / 100) * 63);
      encoderOptions = { ...(defaults || {}), quality: cqLevel, ...(settings.advanced ?? {}) };
    } else {
      encoderOptions = { ...(defaults || {}), quality: settings.quality, ...(settings.advanced ?? {}) };
    }

    // Reconstruct ImageData from transferred buffer
    const pixelData = new Uint8ClampedArray(pixelBuffer);

    // Report progress: encoding
    self.postMessage({ type: 'progress', payload: { id, progress: 80 } });

    // Encode using WASM codec
    const resultBuffer = await encodeImage(
      settings.outputFormat,
      pixelData,
      width,
      height,
      encoderOptions,
    );

    // Report completion
    self.postMessage(
      {
        type: 'result',
        payload: {
          id,
          resultBuffer,
          originalSize: originalSize ?? pixelBuffer.byteLength,
          compressedSize: resultBuffer.byteLength,
        },
      },
      { transfer: [resultBuffer] },
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      payload: {
        id,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
};
