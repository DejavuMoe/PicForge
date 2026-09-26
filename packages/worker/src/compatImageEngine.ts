import {
  decodeAndResizeImage,
  validateSourceDimensions,
  type DownscaleStrategy,
} from './imageProcessor';
import type { ImageEngine } from './imageEngine';
import { readPngPassthrough } from './pngPassthrough';
import { WORKER_DECODE_FAILED, WORKER_DECODE_UNSUPPORTED } from './workerDecode';
import type { TaskCallbacks, TaskInput, TaskResultSize, WorkerPool } from './workerPool';

export interface CompatImageEngineDeps {
  getPool: () => WorkerPool;
  decodeAndResizeImage: typeof decodeAndResizeImage;
  readPngPassthrough: typeof readPngPassthrough;
  /** Whether this source should be decoded in the encoding Worker. */
  canDecodeInWorker: (source: Blob) => boolean;
  downscale: DownscaleStrategy;
}

/** Set once a Worker reports that this runtime cannot decode there at all. */
let workerDecodeUnavailable = false;

/**
 * Worker decoding needs createImageBitmap and a 2D OffscreenCanvas. SVG needs a
 * document to render, so it always uses the main-thread decoder.
 */
export function canDecodeInWorker(source: Blob): boolean {
  const name = (source as Partial<File>).name ?? '';
  return (
    !workerDecodeUnavailable &&
    typeof createImageBitmap === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    source.type !== 'image/svg+xml' &&
    !/\.svgz?$/i.test(name)
  );
}

/** Test hook: forget a previous capability failure. */
export function resetWorkerDecodeCapability(): void {
  workerDecodeUnavailable = false;
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
 * Browser decode + jSquash encoding. Normally the encoding Worker decodes and
 * resizes the original Blob itself (createImageBitmap + OffscreenCanvas), so a
 * large photo never blocks the page. If the runtime or this file cannot be
 * decoded there, the same original Blob is drawn on the main thread directly
 * into the target-size canvas; the full source is never read back as RGBA.
 * Cancellation and timeouts are final and never fall back.
 *
 * PNG → PNG without resizing sends sanitized original PNG bytes to OxiPNG
 * instead (see pngPassthrough.ts); anything it cannot keep equivalent falls
 * back to the Canvas path before any work is queued.
 */
export function createCompatImageEngine(
  getPool: () => WorkerPool,
  overrides: Partial<Omit<CompatImageEngineDeps, 'getPool'>> = {},
): ImageEngine {
  const deps = {
    decodeAndResizeImage,
    readPngPassthrough,
    canDecodeInWorker,
    downscale: 'stepped' as DownscaleStrategy,
    ...overrides,
  };
  return {
    kind: 'compat',
    supports: ({ settings }) =>
      ['mozjpeg', 'webp', 'avif', 'oxipng'].includes(settings.outputFormat),
    async process({ id, source, settings, onProgress }, signal) {
      signal?.throwIfAborted();
      onProgress?.(0);
      signal?.throwIfAborted();
      const pool = getPool();
      const run = (submit: (callbacks: TaskCallbacks) => void) =>
        new Promise<{ buffer: ArrayBuffer; size?: TaskResultSize }>((resolve, reject) => {
          const abort = () => {
            pool.abortTask(id);
            reject(signal?.reason ?? new DOMException('Task cancelled', 'AbortError'));
          };
          const cleanup = () => signal?.removeEventListener('abort', abort);
          signal?.addEventListener('abort', abort, { once: true });
          try {
            signal?.throwIfAborted();
            submit({
              onProgress: (_id, progress) => {
                if (!signal?.aborted) onProgress?.(progress);
              },
              onResult: (_id, output, _originalSize, _compressedSize, size) => {
                cleanup();
                resolve({ buffer: output, size });
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
      const encode = async (pixels: ArrayBuffer, width: number, height: number, input: TaskInput) =>
        (
          await run((callbacks) =>
            pool.enqueue(id, pixels, width, height, source.size, settings, callbacks, { input }),
          )
        ).buffer;
      const isFinal = (error: unknown) => {
        signal?.throwIfAborted();
        const message = error instanceof Error ? error.message : '';
        return (error as Error)?.name === 'AbortError' || message.startsWith('Task timed out');
      };
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
          if (isFinal(error)) throw error;
        }
      }

      if (deps.canDecodeInWorker(source)) {
        try {
          const { buffer, size } = await run((callbacks) =>
            pool.enqueueSource(id, source, settings, callbacks, { downscale: deps.downscale }),
          );
          if (!size) throw new Error(`${WORKER_DECODE_FAILED}: no decoded dimensions`);
          return result(buffer, size);
        } catch (error) {
          if (isFinal(error)) throw error;
          const message = error instanceof Error ? error.message : '';
          if (message.startsWith(WORKER_DECODE_UNSUPPORTED)) workerDecodeUnavailable = true;
          // Safety-limit, settings and encoder errors are the same on either path.
          else if (!message.startsWith(WORKER_DECODE_FAILED)) throw error;
        }
      }

      const rendered = await deps.decodeAndResizeImage(source, settings.resize, {
        signal,
        downscale: deps.downscale,
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
