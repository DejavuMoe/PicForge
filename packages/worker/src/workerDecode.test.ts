import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMANENT_IMAGE_ERROR_PREFIX } from './imageProcessor';
import {
  WORKER_DECODE_FAILED,
  WORKER_DECODE_UNSUPPORTED,
  decodeAndResizeInWorker,
} from './workerDecode';

function mockWorkerCanvas(width: number, height: number) {
  const canvases: Array<{ width: number; height: number }> = [];
  const bitmap = { width, height, close: vi.fn() };
  const createImageBitmap = vi.fn(async () => bitmap);
  class MockOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {
      canvases.push(this);
    }
    getContext() {
      return {
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
    }
  }
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
  return { bitmap, canvases, createImageBitmap };
}

const resize = {
  enabled: true,
  mode: 'absolute' as const,
  maxWidth: 1000,
  maxHeight: 1000,
  percentage: 50,
  method: 'contain' as const,
};

describe('decodeAndResizeInWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a missing runtime capability separately from a bad file', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    await expect(decodeAndResizeInWorker(new Blob(['x']), resize)).rejects.toThrow(
      WORKER_DECODE_UNSUPPORTED,
    );
  });

  it('decodes with EXIF orientation and sRGB conversion, then releases everything', async () => {
    const { bitmap, canvases, createImageBitmap } = mockWorkerCanvas(4000, 3000);
    const source = new Blob(['jpeg']);
    const onDecoded = vi.fn();
    const result = await decodeAndResizeInWorker(source, resize, { onDecoded });
    expect(createImageBitmap).toHaveBeenCalledWith(source, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
    });
    expect(onDecoded).toHaveBeenCalledWith({ originalWidth: 4000, originalHeight: 3000 });
    expect(result).toMatchObject({ width: 1000, height: 750, originalWidth: 4000 });
    expect(result.data.byteLength).toBe(1000 * 750 * 4);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    // Probe, one halving step and the target are all released.
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('marks an undecodable file for the main-thread fallback', async () => {
    mockWorkerCanvas(1, 1);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      }),
    );
    await expect(decodeAndResizeInWorker(new Blob(['x']), resize)).rejects.toThrow(
      `${WORKER_DECODE_FAILED}: The source image could not be decoded.`,
    );
  });

  it('treats rejected decode options as a runtime capability gap', async () => {
    mockWorkerCanvas(1, 1);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new TypeError("'from-image' is not a valid value");
      }),
    );
    await expect(decodeAndResizeInWorker(new Blob(['x']), resize)).rejects.toThrow(
      WORKER_DECODE_UNSUPPORTED,
    );
  });

  it('keeps safety-limit rejections permanent and allocates no target', async () => {
    const { bitmap, canvases } = mockWorkerCanvas(10_000, 6000);
    await expect(decodeAndResizeInWorker(new Blob(['x']), resize)).rejects.toThrow(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    // Only the 1x1 capability probe was created.
    expect(canvases).toHaveLength(1);
  });
});
