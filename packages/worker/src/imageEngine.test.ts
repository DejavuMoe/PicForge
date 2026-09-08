import { describe, expect, it, vi } from 'vitest';
import {
  createImageProcessor,
  ImageEngineError,
  type ImageEngine,
  type ImageProcessRequest,
  type ImageProcessResult,
  type ImageRuntimeCapabilities,
} from './imageEngine';

const capabilities: ImageRuntimeCapabilities = {
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  worker: true,
  wasm: true,
};
const request: ImageProcessRequest = {
  id: 'test',
  source: new Blob([new Uint8Array([1, 2, 3, 4])]),
  settings: { outputFormat: 'mozjpeg', quality: 75, advanced: {} },
};
function engine(kind: ImageEngine['kind']) {
  return {
    kind,
    supports: vi.fn(() => true),
    process: vi.fn(async (input: ImageProcessRequest): Promise<ImageProcessResult> => ({
      buffer: await input.source.arrayBuffer(),
      width: 1,
      height: 1,
      originalWidth: 2,
      originalHeight: 2,
      originalSize: input.source.size,
      outputSize: input.source.size,
      engine: kind,
    })),
  };
}

describe('image engine policy', () => {
  it('rereads the original Blob after the preferred engine transfers and fails', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    vips.process.mockImplementationOnce(async ({ source }) => {
      const transferred = await source.arrayBuffer();
      structuredClone(transferred, { transfer: [transferred] });
      expect(transferred.byteLength).toBe(0);
      throw new ImageEngineError('worker crashed', 'runtime');
    });
    const processor = createImageProcessor(compat, vips);
    const result = await processor.process(request, undefined, 'auto', capabilities);
    expect(result.engine).toBe('compat');
    expect([...new Uint8Array(result.buffer)]).toEqual([1, 2, 3, 4]);
    expect(compat.process).toHaveBeenCalledTimes(1);
    expect(compat.process.mock.calls[0][0].source).toBe(request.source);
  });

  it('opens the session breaker after two infrastructure faults, including across files', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    vips.process.mockRejectedValue(new ImageEngineError('init failed', 'runtime'));
    const processor = createImageProcessor(compat, vips);
    for (let i = 0; i < 4; i++) {
      expect(
        (await processor.process({ ...request, id: String(i) }, undefined, 'auto', capabilities))
          .engine,
      ).toBe('compat');
    }
    expect(processor.vipsDisabled).toBe(true);
    expect(vips.process).toHaveBeenCalledTimes(2);
    expect(compat.process).toHaveBeenCalledTimes(4);
    expect(createImageProcessor(compat, vips).vipsDisabled).toBe(false);
  });

  it('keeps the preferred engine available after corrupt or unsupported input', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    const processor = createImageProcessor(compat, vips);
    for (let i = 0; i < 3; i++) {
      vips.process.mockRejectedValueOnce(new ImageEngineError('corrupt input', 'input'));
      await processor.process(request, undefined, 'auto', capabilities);
    }
    vips.supports.mockReturnValueOnce(false);
    await processor.process(request, undefined, 'auto', capabilities);
    expect(processor.vipsDisabled).toBe(false);
    expect((await processor.process(request, undefined, 'auto', capabilities)).engine).toBe('vips');
    expect(vips.process).toHaveBeenCalledTimes(4);
    expect(compat.process).toHaveBeenCalledTimes(4);
  });

  it.each(Object.keys({ ...capabilities, vipsInitializable: true }))(
    'does not try vips when %s is false, even under an override',
    async (flag) => {
      const compat = engine('compat');
      const vips = engine('vips');
      await createImageProcessor(compat, vips).process(request, undefined, 'vips', {
        ...capabilities,
        [flag]: false,
      });
      expect(vips.process).not.toHaveBeenCalled();
      expect(compat.process).toHaveBeenCalledTimes(1);
    },
  );

  it('allows an internal compat override and works without a preferred engine', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    await createImageProcessor(compat, vips).process(request, undefined, 'compat', capabilities);
    await createImageProcessor(compat).process(request);
    expect(vips.supports).not.toHaveBeenCalled();
    expect(compat.process).toHaveBeenCalledTimes(2);
  });

  it('propagates compatibility failure without retrying it', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    vips.process.mockRejectedValue(new ImageEngineError('input', 'input'));
    compat.process.mockRejectedValue(new Error('compat decode failed'));
    await expect(
      createImageProcessor(compat, vips).process(request, undefined, 'auto', capabilities),
    ).rejects.toThrow('compat decode failed');
    expect(compat.process).toHaveBeenCalledTimes(1);
  });

  it('does not fall back or trip the breaker after cancellation, including a late success', async () => {
    const compat = engine('compat');
    const vips = engine('vips');
    const abort = new AbortController();
    vips.process.mockImplementationOnce(async () => {
      abort.abort();
      throw new ImageEngineError('worker terminated', 'runtime');
    });
    const processor = createImageProcessor(compat, vips);
    await expect(
      processor.process(request, abort.signal, 'auto', capabilities),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const late = new AbortController();
    vips.process.mockImplementationOnce(async () => {
      const result = await engine('vips').process(request);
      late.abort();
      return result;
    });
    await expect(
      processor.process(request, late.signal, 'auto', capabilities),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(compat.process).not.toHaveBeenCalled();
    expect(processor.vipsDisabled).toBe(false);
  });
});
