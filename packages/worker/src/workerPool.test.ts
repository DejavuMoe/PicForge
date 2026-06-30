import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import {
  getFormatConcurrencyLimit,
  getRecommendedWorkerPoolSize,
  WorkerPool,
} from './workerPool';

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.messages.push(message);
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
});
