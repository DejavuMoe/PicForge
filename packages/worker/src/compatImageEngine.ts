import { decodeImage, resizeImage } from './imageProcessor';
import type { ImageEngine } from './imageEngine';
import type { WorkerPool } from './workerPool';

export interface CompatImageEngineDeps {
  getPool: () => WorkerPool;
  decodeImage: typeof decodeImage;
  resizeImage: typeof resizeImage;
}

/** Preserve the existing Canvas decode/resize and jSquash Worker encoding path. */
export function createCompatImageEngine(
  getPool: () => WorkerPool,
  overrides: Partial<Omit<CompatImageEngineDeps, 'getPool'>> = {},
): ImageEngine {
  const deps = { decodeImage, resizeImage, ...overrides };
  return {
    kind: 'compat',
    supports: ({ settings }) =>
      ['mozjpeg', 'webp', 'avif', 'oxipng'].includes(settings.outputFormat),
    async process({ id, source, settings, onProgress }, signal) {
      signal?.throwIfAborted();
      const input = await source.arrayBuffer();
      signal?.throwIfAborted();
      onProgress?.(0);
      signal?.throwIfAborted();
      const decoded = await deps.decodeImage(input);
      signal?.throwIfAborted();
      onProgress?.(30);
      const resized = settings.resize?.enabled
        ? deps.resizeImage(decoded.data, decoded.width, decoded.height, settings.resize)
        : decoded;
      signal?.throwIfAborted();
      onProgress?.(50);
      const pixels = resized.data.buffer.slice(0) as ArrayBuffer;
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
          pool.enqueue(id, pixels, resized.width, resized.height, source.size, settings, {
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
        width: resized.width,
        height: resized.height,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        originalSize: source.size,
        outputSize: buffer.byteLength,
        engine: 'compat',
      };
    },
  };
}
