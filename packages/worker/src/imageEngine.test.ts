import { describe, expect, it, vi } from 'vitest';
import {
  createImageProcessor,
  type ImageEngine,
  type ImageProcessRequest,
  type ImageProcessResult,
} from './imageEngine';

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

describe('image processor', () => {
  it('sends still images to Compat with the original Blob', async () => {
    const compat = engine('compat');
    const result = await createImageProcessor(compat, engine('animation')).process(request);
    expect(result.engine).toBe('compat');
    expect(compat.process.mock.calls[0][0].source).toBe(request.source);
  });

  it('rejects formats Compat cannot encode', async () => {
    const compat = engine('compat');
    compat.supports.mockReturnValue(false);
    await expect(createImageProcessor(compat).process(request)).rejects.toThrow(
      'Unsupported image format',
    );
    expect(compat.process).not.toHaveBeenCalled();
  });

  it('propagates Compat failure without retrying it', async () => {
    const compat = engine('compat');
    compat.process.mockRejectedValue(new Error('compat decode failed'));
    await expect(createImageProcessor(compat).process(request)).rejects.toThrow(
      'compat decode failed',
    );
    expect(compat.process).toHaveBeenCalledTimes(1);
  });

  it('never publishes a result after cancellation, including a late success', async () => {
    const compat = engine('compat');
    const abort = new AbortController();
    compat.process.mockImplementationOnce(async (input) => {
      const result = await engine('compat').process(input);
      abort.abort();
      return result;
    });
    await expect(createImageProcessor(compat).process(request, abort.signal)).rejects.toMatchObject(
      { name: 'AbortError' },
    );
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      createImageProcessor(compat).process(request, cancelled.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(compat.process).toHaveBeenCalledTimes(1);
  });
});
