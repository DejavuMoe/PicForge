import { describe, expect, it, vi } from 'vitest';
import { createCompatImageEngine, toOwnedPixelBuffer } from './compatImageEngine';
import type { WorkerPool } from './workerPool';
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
