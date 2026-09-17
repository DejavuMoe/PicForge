import { decodeAndResizeImage } from './imageProcessor';
import type { ImageEngine } from './imageEngine';
import type { WorkerPool } from './workerPool';

export interface CompatImageEngineDeps {
  getPool: () => WorkerPool;
  decodeAndResizeImage: typeof decodeAndResizeImage;
}

/**
 * Transfer the pixel buffer only when the view covers the whole ArrayBuffer.
 * A view with an offset or extra capacity copies just the visible bytes; the
 * underlying (possibly larger) buffer is never transferred wholesale.
 */
export function toOwnedPixelBuffer(data: Uint8ClampedArray): ArrayBuffer {
  const buffer = data.buffer as ArrayBuffer;
  if (data.byteOffset === 0 && data.byteLength === buffer.byteLength) return buffer;
  return buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

/**
 * Preserve the existing browser decode and jSquash Worker encoding path, but
 * draw the original Blob directly into the target-size canvas. The source is
 * never materialized as a full-frame RGBA array and no intermediate source
 * canvas is created.
 */
export function createCompatImageEngine(
  getPool: () => WorkerPool,
  overrides: Partial<Omit<CompatImageEngineDeps, 'getPool'>> = {},
): ImageEngine {
  const deps = { decodeAndResizeImage, ...overrides };
  return {
    kind: 'compat',
    supports: ({ settings }) =>
      ['mozjpeg', 'webp', 'avif', 'oxipng'].includes(settings.outputFormat),
    async process({ id, source, settings, onProgress }, signal) {
      signal?.throwIfAborted();
      onProgress?.(0);
      signal?.throwIfAborted();
      const decoded = await deps.decodeAndResizeImage(source, settings.resize, {
        signal,
        onDecoded: () => onProgress?.(30),
        onResized: () => onProgress?.(50),
      });
      signal?.throwIfAborted();
      const pixels = toOwnedPixelBuffer(decoded.data);
      signal?.throwIfAborted();
      const pool = getPool();
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const abort = () => {
          pool.abortTask(id);
          reject(signal?.reason ?? new DOMException('Task cancelled', 'AbortError'));
        };
        const cleanup = () => signal?.removeEventListener('abort', abort);
        signal?.addEventListener('abort', abort, { once: true });
        try {
          signal?.throwIfAborted();
          pool.enqueue(id, pixels, decoded.width, decoded.height, source.size, settings, {
            onProgress: (_id, progress) => {
              if (!signal?.aborted) onProgress?.(progress);
            },
            onResult: (_id, output) => {
              cleanup();
              resolve(output);
            },
            onError: (_id, message) => {
              cleanup();
              reject(
                message === 'Task cancelled' || message === 'Task aborted'
                  ? new DOMException(message, 'AbortError')
                  : new Error(message),
              );
            },
          });
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
      signal?.throwIfAborted();
      return {
        buffer,
        width: decoded.width,
        height: decoded.height,
        originalWidth: decoded.originalWidth,
        originalHeight: decoded.originalHeight,
        originalSize: source.size,
        outputSize: buffer.byteLength,
        engine: 'compat',
      };
    },
  };
}
