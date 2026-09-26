/**
 * Web Worker for image encoding.
 *
 * `source` tasks decode and resize the original Blob here (createImageBitmap +
 * OffscreenCanvas), then encode. `rgba` tasks carry pixels the main thread already
 * decoded; `png` tasks carry sanitized PNG bytes for OxiPNG.
 */

import { encodeImage, optimisePng, type OxipngOptions } from '@pic-forge/codecs';
import { buildEncoderOptions } from './encoderOptions';
import { decodeAndResizeInWorker } from './workerDecode';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type !== 'task') return;

  const { id, source, downscale, originalSize, settings, input } = payload;
  let { pixelBuffer, width, height } = payload;
  let size:
    { width: number; height: number; originalWidth: number; originalHeight: number } | undefined;

  try {
    if (input === 'source') {
      const rendered = await decodeAndResizeInWorker(source, settings.resize, {
        downscale,
        onDecoded: () => self.postMessage({ type: 'progress', payload: { id, progress: 30 } }),
        onResized: () => self.postMessage({ type: 'progress', payload: { id, progress: 50 } }),
      });
      ({ width, height } = rendered);
      size = {
        width,
        height,
        originalWidth: rendered.originalWidth,
        originalHeight: rendered.originalHeight,
      };
      pixelBuffer = rendered.data.buffer;
      // Lets the pool size its watchdog and recycling decision by the real target.
      self.postMessage({ type: 'decoded', payload: { id, ...size } });
    }

    // Report progress: starting encoding
    self.postMessage({ type: 'progress', payload: { id, progress: 60 } });

    const encoderOptions = buildEncoderOptions(settings);

    // Report progress: encoding
    self.postMessage({ type: 'progress', payload: { id, progress: 80 } });

    // Sanitized PNG bytes are optimised directly; everything else is target RGBA.
    const resultBuffer =
      input === 'png'
        ? await optimisePng(pixelBuffer, encoderOptions as unknown as OxipngOptions)
        : await encodeImage(
            settings.outputFormat,
            new Uint8ClampedArray(pixelBuffer),
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
          size,
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
