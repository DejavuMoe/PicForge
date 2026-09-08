import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VipsImageEngine } from './VipsImageEngine';
import {
  createImageProcessor,
  getImageRuntimeCapabilities,
  type ImageEngine,
  type ImageProcessRequest,
} from '../imageEngine';
import type { VipsWorkerRequest, VipsWorkerResponse } from './vipsEngineWorker';

class FakeWorker {
  onmessage?: (event: MessageEvent<VipsWorkerResponse>) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn<(message: VipsWorkerRequest) => void>();
  terminate = vi.fn();
  respond(data: Omit<Extract<VipsWorkerResponse, { error: string }>, 'token'>) {
    this.onmessage?.({
      data: { token: this.postMessage.mock.lastCall![0].token, ...data },
    } as MessageEvent<VipsWorkerResponse>);
  }
  succeed() {
    const request = this.postMessage.mock.lastCall![0];
    this.onmessage?.({
      data: {
        token: request.token,
        result: {
          buffer: new ArrayBuffer(4),
          width: 1,
          height: 1,
          originalWidth: 2,
          originalHeight: 2,
          originalSize: request.source.size,
          outputSize: 4,
          engine: 'vips',
        },
      },
    } as MessageEvent<VipsWorkerResponse>);
  }
}
const request: ImageProcessRequest = {
  id: 'a',
  source: new Blob(['original'], { type: 'image/png' }),
  settings: { outputFormat: 'mozjpeg', quality: 75 },
};
let workers: FakeWorker[];
let engine: VipsImageEngine;
beforeEach(() => {
  vi.stubGlobal('crossOriginIsolated', true);
  vi.stubGlobal('Worker', FakeWorker);
  workers = [];
  engine = new VipsImageEngine(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  }, 100);
});
afterEach(() => {
  engine.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dedicated Vips lane', () => {
  it('serializes jobs through one reused runtime and preserves Blob ownership', async () => {
    const a = engine.process(request);
    const b = engine.process({ ...request, id: 'b' });
    expect(workers).toHaveLength(1);
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(workers[0].postMessage.mock.calls[0][0].source).toBe(request.source);
    workers[0].succeed();
    expect((await a).engine).toBe('vips');
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    workers[0].succeed();
    await b;
    expect(await request.source.text()).toBe('original');
  });
  it('cancels waiting work immediately without terminating the active Worker', async () => {
    const a = engine.process(request);
    const abort = new AbortController();
    const b = engine.process({ ...request, id: 'b' }, abort.signal);
    abort.abort();
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminate).not.toHaveBeenCalled();
    workers[0].succeed();
    await a;
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
  });
  it('kills active work and ignores late responses after restarting for the next job', async () => {
    const abort = new AbortController();
    const a = engine.process(request, abort.signal);
    const b = engine.process({ ...request, id: 'b' });
    abort.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    workers[0].succeed();
    let completed = false;
    void b.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    workers[1].succeed();
    await b;
  });
  it('reuses runtime after bad input but destroys it after a typed runtime error', async () => {
    const a = engine.process(request);
    workers[0].respond({ error: 'bad image', failure: 'input' });
    await expect(a).rejects.toMatchObject({ failure: 'input' });
    const b = engine.process(request);
    expect(workers).toHaveLength(1);
    workers[0].respond({ error: 'WASM failed', failure: 'runtime' });
    await expect(b).rejects.toMatchObject({ failure: 'runtime' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const c = engine.process(request);
    workers[1].succeed();
    await c;
  });
  it('preserves a Worker-originated AbortError without turning it into an input/runtime failure', async () => {
    const task = engine.process(request);
    workers[0].respond({ error: 'Read aborted', failure: 'cancelled' });
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it('classifies Worker startup, postMessage, crash and deserialization faults as runtime', async () => {
    const startup = new VipsImageEngine(() => {
      throw new Error('startup');
    });
    await expect(startup.process(request)).rejects.toMatchObject({ failure: 'runtime' });
    const a = engine.process(request);
    workers[0].onerror?.({ message: 'crash', preventDefault() {} } as ErrorEvent);
    await expect(a).rejects.toMatchObject({ failure: 'runtime' });
    const b = engine.process(request);
    workers[1].onmessageerror?.();
    await expect(b).rejects.toMatchObject({ failure: 'runtime' });
    const send = new VipsImageEngine(() => {
      const worker = new FakeWorker();
      worker.postMessage.mockImplementation(() => {
        throw new Error('clone');
      });
      return worker as unknown as Worker;
    });
    await expect(send.process(request)).rejects.toMatchObject({ failure: 'runtime' });
  });
  it('terminates timed-out work and uses the original Blob for exactly one fallback', async () => {
    vi.useFakeTimers();
    const compat: ImageEngine = {
      kind: 'compat',
      supports: () => true,
      process: vi.fn<ImageEngine['process']>(async ({ source }) => ({
        buffer: await source.arrayBuffer(),
        width: 1,
        height: 1,
        originalWidth: 1,
        originalHeight: 1,
        originalSize: source.size,
        outputSize: source.size,
        engine: 'compat',
      })),
    };
    const processor = createImageProcessor(compat, engine);
    const result = processor.process(request);
    await vi.advanceTimersByTimeAsync(101);
    expect((await result).engine).toBe('compat');
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(compat.process).toHaveBeenCalledExactlyOnceWith(request, undefined);
  });
  it('does not instantiate workers for unsupported formats, overrides, or absent isolation', async () => {
    expect(
      engine.supports(
        { ...request, settings: { ...request.settings, outputFormat: 'oxipng' } },
        getImageRuntimeCapabilities(),
      ),
    ).toBe(false);
    vi.stubGlobal('crossOriginIsolated', false);
    await expect(engine.process(request)).rejects.toMatchObject({ failure: 'input' });
    expect(workers).toHaveLength(0);
  });
  it('honors cancellation caused by the start callback before creating a Worker', async () => {
    const abort = new AbortController();
    await expect(
      engine.process({ ...request, onProgress: () => abort.abort() }, abort.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(0);
    expect(engine.phase).toBe('idle');
  });
  it('rejects a malformed terminal response instead of leaving the queue hung', async () => {
    const a = engine.process(request);
    const token = workers[0].postMessage.mock.lastCall![0].token;
    workers[0].onmessage?.({ data: { token } } as MessageEvent<VipsWorkerResponse>);
    await expect(a).rejects.toMatchObject({ failure: 'runtime' });
    const b = engine.process(request);
    workers[1].succeed();
    await b;
  });
  it('disposes active and waiting jobs with cancellation, not runtime faults', async () => {
    const a = engine.process(request);
    const b = engine.process({ ...request, id: 'b' });
    engine.dispose();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(1);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(engine.phase).toBe('idle');
  });
});
