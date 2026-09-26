import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canDecodeInWorker,
  createCompatImageEngine,
  resetWorkerDecodeCapability,
  toOwnedPixelBuffer,
} from './compatImageEngine';
import type { TaskCallbacks, WorkerPool } from './workerPool';
import type { CompressSettings } from '@pic-forge/codecs';

describe('toOwnedPixelBuffer', () => {
  it('returns the underlying buffer when the view covers it exactly', () => {
    const data = new Uint8ClampedArray(8);
    expect(toOwnedPixelBuffer(data)).toBe(data.buffer);
  });

  it('copies only the visible bytes for offset or shorter views', () => {
    const backing = new Uint8ClampedArray(16);
    backing.set([1, 2, 3, 4], 4);
    const view = backing.subarray(4, 8);

    const owned = toOwnedPixelBuffer(view);
    expect(owned).not.toBe(backing.buffer);
    expect(owned.byteLength).toBe(4);
    expect([...new Uint8ClampedArray(owned)]).toEqual([1, 2, 3, 4]);
    // The source buffer is untouched and still fully addressable.
    expect(backing.byteLength).toBe(16);
    expect(backing[4]).toBe(1);
  });

  it('detaches only the transferred buffer, never the original Blob backing store', () => {
    const data = new Uint8ClampedArray([9, 8, 7, 6]);
    const owned = toOwnedPixelBuffer(data);
    const clone = structuredClone(owned, { transfer: [owned] });
    expect(owned.byteLength).toBe(0);
    expect([...new Uint8ClampedArray(clone)]).toEqual([9, 8, 7, 6]);
    // A fresh decode of the same source yields a new owned buffer (no cross-task sharing).
    const again = toOwnedPixelBuffer(new Uint8ClampedArray([1, 1, 1, 1]));
    expect(again.byteLength).toBe(4);
  });
});

describe('compat engine pixel ownership', () => {
  const settings: CompressSettings = {
    outputFormat: 'mozjpeg',
    quality: 75,
    advanced: {},
    resize: { enabled: false, mode: 'absolute', maxWidth: 16, maxHeight: 16, percentage: 50, method: 'contain' },
  };

  it('transfers the decoded buffer and does not reread it after enqueue', async () => {
    const pixelData = new Uint8ClampedArray([1, 2, 3, 4]);
    const enqueued: Array<{ buffer: ArrayBuffer }> = [];
    const pool = {
      enqueue: vi.fn((_id, buffer: ArrayBuffer, _w, _h, _size, _settings, callbacks) => {
        enqueued.push({ buffer });
        // Simulate the transfer detaching the buffer before the worker resolves.
        structuredClone(buffer, { transfer: [buffer] });
        callbacks.onResult?.(_id, new ArrayBuffer(2), 4, 2);
      }),
    } as unknown as WorkerPool;

    const engine = createCompatImageEngine(() => pool, {
      decodeAndResizeImage: async () => ({
        data: pixelData,
        width: 1,
        height: 1,
        originalWidth: 1,
        originalHeight: 1,
      }),
    });

    const result = await engine.process({ id: 'p', source: new Blob([new Uint8Array(4)]), settings });
    expect(result.engine).toBe('compat');
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].buffer).toBe(pixelData.buffer);
    expect(pixelData.buffer.byteLength).toBe(0);
    expect(result.originalWidth).toBe(1);
    expect(result.outputSize).toBe(2);
  });
});

describe('compat engine Worker decoding', () => {
  const settings: CompressSettings = {
    outputFormat: 'webp',
    quality: 75,
    advanced: {},
    resize: { enabled: true, mode: 'absolute', maxWidth: 16, maxHeight: 16, percentage: 50, method: 'contain' },
  };
  const size = { width: 16, height: 12, originalWidth: 64, originalHeight: 48 };
  const mainThread = () =>
    vi.fn(async () => ({
      data: new Uint8ClampedArray(16 * 12 * 4),
      width: 16,
      height: 12,
      originalWidth: 64,
      originalHeight: 48,
    }));

  /** A pool whose source tasks end with `sourceOutcome`; pixel tasks succeed. */
  function pool(sourceOutcome: (callbacks: TaskCallbacks) => void) {
    return {
      enqueueSource: vi.fn(
        (_id: string, _source: Blob, _settings: unknown, callbacks: TaskCallbacks, _options?: unknown) =>
          sourceOutcome(callbacks),
      ),
      enqueue: vi.fn(
        (id: string, _b: unknown, _w: unknown, _h: unknown, _s: unknown, _t: unknown, callbacks: TaskCallbacks) =>
          callbacks.onResult?.(id, new ArrayBuffer(3), 1, 3),
      ),
      abortTask: vi.fn(),
    };
  }

  afterEach(() => {
    resetWorkerDecodeCapability();
    vi.unstubAllGlobals();
  });

  it('sends the original Blob to the Worker and never decodes on the main thread', async () => {
    const workers = pool((callbacks) => callbacks.onResult?.('w', new ArrayBuffer(5), 1, 5, size));
    const decode = mainThread();
    const engine = createCompatImageEngine(() => workers as unknown as WorkerPool, {
      canDecodeInWorker: () => true,
      decodeAndResizeImage: decode,
    });
    const source = new Blob(['jpeg'], { type: 'image/jpeg' });
    const result = await engine.process({ id: 'w', source, settings });
    expect(workers.enqueueSource.mock.calls[0][1]).toBe(source);
    expect(workers.enqueueSource.mock.calls[0][4]).toEqual({ downscale: 'stepped' });
    expect(decode).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ...size, outputSize: 5, engine: 'compat' });
  });

  it('falls back once to the main thread with the same Blob after a decode failure', async () => {
    const workers = pool((callbacks) =>
      callbacks.onError?.('f', 'Worker decode failed: The source image could not be decoded.'),
    );
    const decode = mainThread();
    const engine = createCompatImageEngine(() => workers as unknown as WorkerPool, {
      canDecodeInWorker: () => true,
      decodeAndResizeImage: decode,
    });
    const source = new Blob(['bmp']);
    const result = await engine.process({ id: 'f', source, settings });
    expect(decode).toHaveBeenCalledTimes(1);
    expect((decode.mock.calls[0] as unknown[])[0]).toBe(source);
    expect(workers.enqueue).toHaveBeenCalledTimes(1);
    expect(result.outputSize).toBe(3);
    // A later file still tries the Worker first.
    await engine.process({ id: 'f2', source, settings });
    expect(workers.enqueueSource).toHaveBeenCalledTimes(2);
  });

  it('stops trying Worker decoding after the runtime reports it unsupported', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('OffscreenCanvas', class {});
    const workers = pool((callbacks) =>
      callbacks.onError?.('u', 'Worker decode unsupported: no OffscreenCanvas 2D context'),
    );
    const decode = mainThread();
    const engine = createCompatImageEngine(() => workers as unknown as WorkerPool, {
      decodeAndResizeImage: decode,
    });
    const source = new Blob(['jpeg'], { type: 'image/jpeg' });
    await engine.process({ id: 'u', source, settings });
    await engine.process({ id: 'u2', source, settings });
    expect(workers.enqueueSource).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('never falls back on cancellation, timeouts or input and encoder errors', async () => {
    for (const message of [
      'Task timed out after 45s',
      'Image exceeds browser safety limit: 60MP is above the 50MP limit for this device.',
      'WebP encode failed',
    ]) {
      const workers = pool((callbacks) => callbacks.onError?.('e', message));
      const decode = mainThread();
      const engine = createCompatImageEngine(() => workers as unknown as WorkerPool, {
        canDecodeInWorker: () => true,
        decodeAndResizeImage: decode,
      });
      await expect(engine.process({ id: 'e', source: new Blob(['x']), settings })).rejects.toThrow(
        message,
      );
      expect(decode).not.toHaveBeenCalled();
    }

    const controller = new AbortController();
    const workers = pool(() => controller.abort());
    const decode = mainThread();
    const engine = createCompatImageEngine(() => workers as unknown as WorkerPool, {
      canDecodeInWorker: () => true,
      decodeAndResizeImage: decode,
    });
    await expect(
      engine.process({ id: 'a', source: new Blob(['x']), settings }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers.abortTask).toHaveBeenCalledWith('a');
    expect(decode).not.toHaveBeenCalled();
  });

  it('keeps SVG and runtimes without OffscreenCanvas on the main thread', () => {
    const jpeg = new Blob(['x'], { type: 'image/jpeg' });
    expect(canDecodeInWorker(jpeg)).toBe(false);
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('OffscreenCanvas', class {});
    expect(canDecodeInWorker(jpeg)).toBe(true);
    expect(canDecodeInWorker(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).toBe(false);
    expect(canDecodeInWorker(new File(['<svg/>'], 'icon.SVG'))).toBe(false);
  });
});
