import { decodeAndResizeImage, validateSourceDimensions } from './imageProcessor';
import type { ImageEngine } from './imageEngine';
import { readPngPassthrough } from './pngPassthrough';
import type { TaskInput, WorkerPool } from './workerPool';

export interface CompatImageEngineDeps {
  getPool: () => WorkerPool;
  decodeAndResizeImage: typeof decodeAndResizeImage;
  readPngPassthrough: typeof readPngPassthrough;
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
 *
 * PNG → PNG without resizing sends sanitized original PNG bytes to OxiPNG
 * instead (see pngPassthrough.ts); anything it cannot keep equivalent falls
 * back to the Canvas path before any work is queued.
 */
export function createCompatImageEngine(
  getPool: () => WorkerPool,
  overrides: Partial<Omit<CompatImageEngineDeps, 'getPool'>> = {},
): ImageEngine {
  const deps = { decodeAndResizeImage, readPngPassthrough, ...overrides };
  return {
    kind: 'compat',
    supports: ({ settings }) =>
      ['mozjpeg', 'webp', 'avif', 'oxipng'].includes(settings.outputFormat),
    async process({ id, source, settings, onProgress }, signal) {
      signal?.throwIfAborted();
      onProgress?.(0);
      signal?.throwIfAborted();
      const pool = getPool();
      const encode = (pixels: ArrayBuffer, width: number, height: number, input: TaskInput) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          const abort = () => {
            pool.abortTask(id);
            reject(signal?.reason ?? new DOMException('Task cancelled', 'AbortError'));
          };
          const cleanup = () => signal?.removeEventListener('abort', abort);
          signal?.addEventListener('abort', abort, { once: true });
          try {
            signal?.throwIfAborted();
            pool.enqueue(id, pixels, width, height, source.size, settings, {
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
            }, { input });
          } catch (error) {
            cleanup();
            reject(error);
          }
        });
      const result = (
        buffer: ArrayBuffer,
        size: { width: number; height: number; originalWidth: number; originalHeight: number },
      ) => {
        signal?.throwIfAborted();
        return {
          buffer,
          ...size,
          originalSize: source.size,
          outputSize: buffer.byteLength,
          engine: 'compat' as const,
        };
      };

      const passthrough =
        settings.outputFormat === 'oxipng' && !settings.resize?.enabled
          ? await deps.readPngPassthrough(source)
          : null;
      signal?.throwIfAborted();
      if (passthrough) {
        const sourceError = validateSourceDimensions(passthrough.width, passthrough.height);
        if (sourceError) throw new Error(sourceError);
        onProgress?.(50);
        try {
          const { width, height } = passthrough;
          const buffer = await encode(passthrough.png, width, height, 'png');
          return result(buffer, { width, height, originalWidth: width, originalHeight: height });
        } catch (error) {
          // Browsers tolerate some damage (for example bad CRCs) that OxiPNG rejects:
          // retry once from the original Blob through the Canvas path. Cancellation
          // and timeouts are final.
          signal?.throwIfAborted();
          const message = error instanceof Error ? error.message : '';
          if ((error as Error)?.name === 'AbortError' || message.startsWith('Task timed out'))
            throw error;
        }
      }

      const rendered = await deps.decodeAndResizeImage(source, settings.resize, {
        signal,
        onDecoded: () => onProgress?.(30),
        onResized: () => onProgress?.(50),
      });
      signal?.throwIfAborted();
      const buffer = await encode(
        toOwnedPixelBuffer(rendered.data),
        rendered.width,
        rendered.height,
        'rgba',
      );
      return result(buffer, {
        width: rendered.width,
        height: rendered.height,
        originalWidth: rendered.originalWidth,
        originalHeight: rendered.originalHeight,
      });
    },
  };
}
