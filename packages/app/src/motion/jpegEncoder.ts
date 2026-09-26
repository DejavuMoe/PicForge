/**
 * MozJPEG encoding for converted HEIC stills, in the same jSquash Worker as the
 * compressor but in a separate one-Worker pool: cancelling or clearing the
 * compression batch must never abort a Live Photo job, and vice versa. The pool
 * creates its Worker on demand and releases it when idle.
 */

import { WorkerPool } from '@pic-forge/worker';

let pool: WorkerPool | null = null;

function getPool(): WorkerPool {
  pool ??= new WorkerPool({ poolSize: 1 });
  return pool;
}

export function setJpegPoolForTests(next: WorkerPool | null): void {
  pool = next;
}

/** Encode transferred RGBA; errors are Motion error keys (`timeout`, `engineFailed`). */
export function encodeJpeg(
  rgba: ArrayBuffer,
  width: number,
  height: number,
  quality: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  const id = `heic-${crypto.randomUUID()}`;
  const workers = getPool();
  return new Promise((resolve, reject) => {
    const abort = () => {
      workers.abortTask(id);
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    workers.enqueue(
      id,
      rgba,
      width,
      height,
      rgba.byteLength,
      { outputFormat: 'mozjpeg', quality, advanced: {} },
      {
        onResult: (_id, output) => {
          signal.removeEventListener('abort', abort);
          resolve(output);
        },
        onError: (_id, message) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) return;
          reject(new Error(message.startsWith('Task timed out') ? 'timeout' : 'engineFailed'));
        },
      },
    );
  });
}
