import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import {
  getFormatConcurrencyLimit,
  getRecommendedWorkerPoolSize,
  getTaskTimeoutMs,
  WorkerPool,
} from './workerPool';

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  transfers: unknown[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: unknown, options?: { transfer?: unknown[] }) {
    this.messages.push(message);
    this.transfers.push(options?.transfer);
  }

  emit(type: string, payload: Record<string, unknown>) {
    this.onmessage?.({ data: { type, payload } } as MessageEvent);
  }

  terminate() {
    this.terminated = true;
  }

  emitResult(id: string) {
    this.onmessage?.({
      data: {
        type: 'result',
        payload: {
          id,
          resultBuffer: new ArrayBuffer(1),
          originalSize: 1,
          compressedSize: 1,
        },
      },
    } as MessageEvent);
  }
}

const baseSettings: CompressSettings = {
  outputFormat: 'mozjpeg',
  quality: 75,
  resize: {
    enabled: false,
    mode: 'absolute',
    maxWidth: 1920,
    maxHeight: 1080,
    percentage: 50,
    method: 'contain',
  },
  advanced: {},
};

describe('WorkerPool', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caps recommended worker count by device size and max pool size', () => {
    expect(getRecommendedWorkerPoolSize(2, 3)).toBe(1);
    expect(getRecommendedWorkerPoolSize(4, 3)).toBe(2);
    expect(getRecommendedWorkerPoolSize(12, 3)).toBe(3);
    expect(getRecommendedWorkerPoolSize(12, 2)).toBe(2);
  });

  it('uses conservative format concurrency for heavy codecs', () => {
    expect(getFormatConcurrencyLimit('avif', 3)).toBe(1);
    expect(getFormatConcurrencyLimit('oxipng', 3)).toBe(2);
    expect(getFormatConcurrencyLimit('mozjpeg', 3)).toBe(3);
    expect(getFormatConcurrencyLimit('webp', 3)).toBe(3);
  });

  it('dispatches only one AVIF task at a time', () => {
    const pool = new WorkerPool(3);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };
    const avifSettings = { ...baseSettings, outputFormat: 'avif' as const };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, avifSettings, callbacks);
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, avifSettings, callbacks);

    expect(pool.activeCount).toBe(1);
    expect(pool.queueSize).toBe(1);
    expect(MockWorker.instances.filter((worker) => worker.messages.length > 0)).toHaveLength(1);

    MockWorker.instances[0].emitResult('a');

    expect(pool.activeCount).toBe(1);
    expect(pool.queueSize).toBe(0);
    const totalMessages = MockWorker.instances.reduce(
      (sum, worker) => sum + worker.messages.length,
      0,
    );
    expect(totalMessages).toBe(2);

    pool.destroy();
  });

  it('can dispatch lighter codecs across the full pool', () => {
    const pool = new WorkerPool(3);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.enqueue('c', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);

    expect(pool.activeCount).toBe(3);
    expect(pool.queueSize).toBe(0);

    pool.destroy();
  });

  it('cancels queued tasks without disturbing active work', () => {
    const pool = new WorkerPool(1);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);

    pool.abortTask('b');

    expect(pool.activeCount).toBe(1);
    expect(pool.queueSize).toBe(0);
    expect(callbacks.onError).toHaveBeenCalledWith('b', 'Task cancelled');

    pool.destroy();
  });

  it('cancels active tasks by terminating and replacing their worker', () => {
    const pool = new WorkerPool(1);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.abortTask('a');

    expect(callbacks.onError).toHaveBeenCalledWith('a', 'Task cancelled');
    expect(MockWorker.instances[0].terminated).toBe(true);
    expect(pool.activeCount).toBe(0);
    expect(pool.queueSize).toBe(0);
    expect(pool.poolSize).toBe(1);

    pool.destroy();
  });

  it('aborts active and queued tasks, then recreates the pool', () => {
    const pool = new WorkerPool(1);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.abortAll();

    expect(callbacks.onError).toHaveBeenCalledWith('a', 'Task aborted');
    expect(callbacks.onError).toHaveBeenCalledWith('b', 'Task aborted');
    expect(pool.activeCount).toBe(0);
    expect(pool.queueSize).toBe(0);
    expect(MockWorker.instances[0].terminated).toBe(true);
    expect(pool.poolSize).toBe(1);

    pool.destroy();
  });

  it('recovers a busy slot after a task timeout and continues queued work', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pool = new WorkerPool(1);
    const callbacks = { onResult: vi.fn(), onError: vi.fn() };

    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, callbacks);

    vi.advanceTimersByTime(45_000);

    expect(callbacks.onError).toHaveBeenCalledWith('a', 'Task timed out after 45s');
    expect(MockWorker.instances[0].terminated).toBe(true);
    expect(pool.activeCount).toBe(1);
    expect(pool.queueSize).toBe(0);
    expect(MockWorker.instances[1].messages).toHaveLength(1);

    pool.destroy();
  });

  it('creates Workers only when a task needs one', () => {
    const pool = new WorkerPool(3);
    expect(MockWorker.instances).toHaveLength(0);
    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, {});
    expect(MockWorker.instances).toHaveLength(1);
    expect(pool.liveWorkerCount).toBe(1);
    expect(pool.poolSize).toBe(3);
    pool.destroy();
  });

  it('retires a Worker after a large task and starts a fresh one for the next', () => {
    const pool = new WorkerPool({ poolSize: 1, recyclePixels: 100 });
    const onResult = vi.fn();
    pool.enqueue('big', new ArrayBuffer(4), 10, 10, 4, baseSettings, { onResult });
    MockWorker.instances[0].emitResult('big');
    expect(onResult).toHaveBeenCalledWith('big', expect.any(ArrayBuffer), 1, 1, undefined);
    expect(MockWorker.instances[0].terminated).toBe(true);
    expect(pool.liveWorkerCount).toBe(0);

    pool.enqueue('small', new ArrayBuffer(4), 2, 2, 4, baseSettings, {});
    expect(MockWorker.instances).toHaveLength(2);
    MockWorker.instances[1].emitResult('small');
    expect(MockWorker.instances[1].terminated).toBe(false);
    pool.destroy();
  });

  it('releases idle Workers after the quiet period', () => {
    vi.useFakeTimers();
    const pool = new WorkerPool({ poolSize: 2, idleTimeoutMs: 1_000 });
    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, {});
    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, {});
    MockWorker.instances[0].emitResult('a');
    vi.advanceTimersByTime(5_000);
    expect(MockWorker.instances[0].terminated).toBe(false);

    MockWorker.instances[1].emitResult('b');
    vi.advanceTimersByTime(999);
    expect(pool.liveWorkerCount).toBe(2);
    vi.advanceTimersByTime(1);
    expect(pool.liveWorkerCount).toBe(0);
    expect(MockWorker.instances.every((worker) => worker.terminated)).toBe(true);
    pool.destroy();
  });

  it('ignores messages from a Worker that has already been retired', () => {
    const pool = new WorkerPool(1);
    const onResult = vi.fn();
    const onError = vi.fn();
    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, { onResult, onError });
    const first = MockWorker.instances[0];
    pool.abortTask('a');
    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, { onResult, onError });
    first.emitResult('a');
    expect(onResult).not.toHaveBeenCalled();
    MockWorker.instances[1].emitResult('a');
    expect(onResult).toHaveBeenCalledTimes(1);
    pool.destroy();
  });

  it('scales the watchdog with target pixels but never below the format base', () => {
    expect(getTaskTimeoutMs('mozjpeg', 1)).toBe(45_000);
    expect(getTaskTimeoutMs('mozjpeg', 12_000_000)).toBe(45_000);
    expect(getTaskTimeoutMs('mozjpeg', 50_000_000)).toBe(100_000);
    expect(getTaskTimeoutMs('oxipng', 1)).toBe(60_000);
    expect(getTaskTimeoutMs('avif', 1)).toBe(120_000);
    expect(getTaskTimeoutMs('avif', 50_000_000)).toBe(300_000);
  });

  it('fails only the affected task when a Worker cannot start', () => {
    let failNext = true;
    class FlakyWorker extends MockWorker {
      constructor() {
        if (failNext) {
          failNext = false;
          throw new Error('blocked');
        }
        super();
      }
    }
    vi.stubGlobal('Worker', FlakyWorker);
    const pool = new WorkerPool(1);
    const onError = vi.fn();
    const onResult = vi.fn();
    pool.enqueue('a', new ArrayBuffer(4), 1, 1, 4, baseSettings, { onError });
    expect(onError).toHaveBeenCalledWith('a', 'Worker error: blocked');
    expect(pool.activeCount).toBe(0);

    pool.enqueue('b', new ArrayBuffer(4), 1, 1, 4, baseSettings, { onResult });
    expect(pool.activeCount).toBe(1);
    MockWorker.instances[0].emitResult('b');
    expect(onResult).toHaveBeenCalledTimes(1);
    pool.destroy();
  });

  it('clones a source Blob to the Worker instead of transferring it', () => {
    const pool = new WorkerPool(1);
    const source = new Blob(['jpeg'], { type: 'image/jpeg' });
    const onResult = vi.fn();
    pool.enqueueSource('s', source, baseSettings, { onResult }, { downscale: 'stepped' });
    const worker = MockWorker.instances[0];
    const message = worker.messages[0] as { payload: Record<string, unknown> };
    expect(message.payload).toMatchObject({ id: 's', input: 'source', source, downscale: 'stepped' });
    expect(message.payload.originalSize).toBe(source.size);
    expect(worker.transfers[0]).toEqual([]);

    const size = { width: 4, height: 3, originalWidth: 8, originalHeight: 6 };
    worker.emit('decoded', { id: 's', ...size });
    worker.emit('result', {
      id: 's',
      resultBuffer: new ArrayBuffer(2),
      originalSize: 4,
      compressedSize: 2,
      size,
    });
    expect(onResult).toHaveBeenCalledWith('s', expect.any(ArrayBuffer), 4, 2, size);
    pool.destroy();
  });

  it('restarts the watchdog and sizes recycling from the decoded target', () => {
    vi.useFakeTimers();
    const pool = new WorkerPool({ poolSize: 1, recyclePixels: 20_000_000 });
    const onError = vi.fn();
    const onResult = vi.fn();
    pool.enqueueSource('big', new Blob(['x']), baseSettings, { onError, onResult });
    const worker = MockWorker.instances[0];
    // Decoding took most of the base window; the encode gets a full target-sized one.
    vi.advanceTimersByTime(40_000);
    worker.emit('decoded', {
      id: 'big',
      width: 5000,
      height: 10_000,
      originalWidth: 5000,
      originalHeight: 10_000,
    });
    vi.advanceTimersByTime(99_999);
    expect(onError).not.toHaveBeenCalled();
    worker.emit('result', {
      id: 'big',
      resultBuffer: new ArrayBuffer(1),
      originalSize: 1,
      compressedSize: 1,
    });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(worker.terminated).toBe(true);

    pool.enqueueSource('stuck', new Blob(['x']), baseSettings, { onError });
    vi.advanceTimersByTime(getTaskTimeoutMs('mozjpeg'));
    expect(onError).toHaveBeenCalledWith('stuck', 'Task timed out after 45s');
    pool.destroy();
  });

  it('passes the task input kind to the Worker', () => {
    const pool = new WorkerPool(1);
    pool.enqueue('png', new ArrayBuffer(4), 1, 1, 4, { ...baseSettings, outputFormat: 'oxipng' }, {}, {
      input: 'png',
    });
    const message = MockWorker.instances[0].messages[0] as { payload: { input: string } };
    expect(message.payload.input).toBe('png');
    pool.destroy();
  });
});
