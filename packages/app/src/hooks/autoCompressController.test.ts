import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import type { TaskCallbacks } from '@pic-forge/worker';
import { WorkerPool } from '@pic-forge/worker';
import {
  AUTO_COMPRESS_DEBOUNCE_MS,
  createAutoCompressController,
  isAutoCompressCandidate,
  type AutoCompressDeps,
} from './autoCompressController';
import { setPoolForTests } from './processingPool';

const NativeURL = globalThis.URL;

vi.stubGlobal('URL', Object.assign(
  function URL(...args: ConstructorParameters<typeof NativeURL>) {
    return new NativeURL(...args);
  },
  NativeURL,
  {
    createObjectURL: vi.fn(() => 'blob:result'),
    revokeObjectURL: vi.fn(),
  },
));

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter += 1;
    return `file-${uuidCounter}`;
  }),
});

const { useFileStore } = await import('../stores/fileStore');
const { useSettingsStore } = await import('../stores/settingsStore');
const { getSettingsHash } = await import('../utils/settingsUtils');
const { isResultExportable } = await import('../utils/exportManifest');

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
          resultBuffer: new ArrayBuffer(8),
          originalSize: 32,
          compressedSize: 8,
        },
      },
    } as MessageEvent);
  }
}

class ControllablePool {
  enqueued: Array<{
    id: string;
    settings: CompressSettings;
    callbacks: TaskCallbacks;
  }> = [];

  enqueue(
    id: string,
    _pixelBuffer: ArrayBuffer,
    _width: number,
    _height: number,
    _originalSize: number,
    settings: CompressSettings,
    callbacks: TaskCallbacks,
  ) {
    this.enqueued.push({ id, settings, callbacks });
  }

  abortTask(id: string) {
    const index = this.enqueued.findIndex((task) => task.id === id);
    if (index === -1) return;
    const [task] = this.enqueued.splice(index, 1);
    task.callbacks.onError?.(id, 'Task cancelled');
  }

  abortAll() {
    for (const task of this.enqueued) {
      task.callbacks.onError?.(task.id, 'Task aborted');
    }
    this.enqueued = [];
  }

  destroy() {}

  complete(id: string) {
    const index = this.enqueued.findIndex((task) => task.id === id);
    if (index === -1) throw new Error(`Task ${id} was not enqueued`);
    const [task] = this.enqueued.splice(index, 1);
    task.callbacks.onResult?.(id, new ArrayBuffer(8), 32, 8);
  }
}

function pixels() {
  return { data: new Uint8ClampedArray(16), width: 2, height: 2 };
}

async function waitUntil(predicate: () => boolean, label: string) {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function createGate<T>(value: T) {
  let releaseFn = () => {};
  let enterFn = () => {};
  let hasEntered = false;
  const entered = new Promise<void>((resolve) => {
    enterFn = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });
  return {
    entered,
    hasEntered: () => hasEntered,
    release: () => releaseFn(),
    wait: async () => {
      hasEntered = true;
      enterFn();
      await released;
      return value;
    },
  };
}

function gatedFile(name = 'a.jpg') {
  const gate = createGate(new ArrayBuffer(32));
  const source = new File([new ArrayBuffer(32)], name, { type: 'image/jpeg' });
  Object.defineProperty(source, 'arrayBuffer', {
    configurable: true,
    value: () => gate.wait(),
  });
  return { source, gate };
}

function seedDoneFile(previewUrl = 'blob:result-a') {
  useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
  const id = useFileStore.getState().files[0].id;
  const hash = getSettingsHash(useSettingsStore.getState().settings);
  useFileStore.getState().updateFile(id, {
    status: 'done',
    lastProcessedSettingsHash: hash,
    result: {
      blob: new Blob([new ArrayBuffer(4)]),
      size: 4,
      previewUrl,
    },
  });
  return id;
}

describe('auto-compress cancel semantics', () => {
  let pool: ControllablePool;

  beforeEach(() => {
    uuidCounter = 0;
    pool = new ControllablePool();
    setPoolForTests(pool as unknown as WorkerPool);
    useFileStore.setState({ files: [] });
    useSettingsStore.setState({ settings: { ...baseSettings, resize: { ...baseSettings.resize! } } });
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:result');
    vi.clearAllMocks();
  });

  afterEach(() => {
    setPoolForTests(null);
    vi.useRealTimers();
  });

  it('does not treat cancelled files as auto-schedule candidates', () => {
    const retryCount = new Map<string, number>();
    expect(
      isAutoCompressCandidate(
        {
          id: 'a',
          file: new File([new ArrayBuffer(8)], 'a.jpg', { type: 'image/jpeg' }),
          originalSize: 8,
          status: 'cancelled',
          settingsMode: 'global',
          progress: 0,
          previewUrl: 'blob:a',
        },
        retryCount,
        2,
        () => false,
      ),
    ).toBe(false);
    expect(
      isAutoCompressCandidate(
        {
          id: 'b',
          file: new File([new ArrayBuffer(8)], 'b.jpg', { type: 'image/jpeg' }),
          originalSize: 8,
          status: 'pending',
          settingsMode: 'global',
          progress: 0,
          previewUrl: 'blob:b',
        },
        retryCount,
        2,
        () => false,
      ),
    ).toBe(true);
  });

  it('does not enqueue again after cancel during encode, even past the debounce window', async () => {
    vi.useFakeTimers();
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: AUTO_COMPRESS_DEBOUNCE_MS,
    });

    controller.schedule();
    await vi.advanceTimersByTimeAsync(AUTO_COMPRESS_DEBOUNCE_MS);
    await waitUntil(() => pool.enqueued.length === 1, 'first enqueue');

    useFileStore.getState().cancelFile(id);
    expect(useFileStore.getState().files[0].status).toBe('cancelled');
    expect(pool.enqueued).toHaveLength(0);

    controller.schedule();
    await vi.advanceTimersByTimeAsync(AUTO_COMPRESS_DEBOUNCE_MS + 50);
    await Promise.resolve();
    expect(pool.enqueued).toHaveLength(0);
    expect(useFileStore.getState().files[0].status).toBe('cancelled');
  });

  it('does not enqueue after cancel during decode once the old decode finishes', async () => {
    const decodeGate = createGate(pixels());
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: () => decodeGate.wait(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const running = controller.run();
    await waitUntil(() => decodeGate.hasEntered(), 'decode barrier');
    useFileStore.getState().cancelFile(id);
    decodeGate.release();
    await running;

    expect(pool.enqueued).toHaveLength(0);
    expect(useFileStore.getState().files[0].status).toBe('cancelled');
  });

  it('does not enqueue after cancel during file read', async () => {
    const { source, gate } = gatedFile();
    useFileStore.getState().addFiles([source]);
    const id = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const running = controller.run();
    await waitUntil(() => gate.hasEntered(), 'read barrier');
    useFileStore.getState().cancelFile(id);
    gate.release();
    await running;

    expect(pool.enqueued).toHaveLength(0);
    expect(useFileStore.getState().getFile(id)?.status).toBe('cancelled');
  });

  it('stops unstarted files in a cancelled batch', async () => {
    useFileStore.getState().addFiles([
      new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'b.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'c.jpg', { type: 'image/jpeg' }),
    ]);
    const started: string[] = [];
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => {
        started.push('dim');
        return { width: 2, height: 2 };
      },
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const running = controller.run();
    await Promise.resolve();
    controller.abortAll();
    await running;

    expect(useFileStore.getState().files.every((file) => file.status === 'cancelled')).toBe(true);
    expect(pool.enqueued).toHaveLength(0);
    expect(started.length).toBeLessThan(3);
  });

  it('drops stale encode results and errors after settings change and retry', async () => {
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const first = controller.run();
    await waitUntil(() => pool.enqueued.length === 1, 'first enqueue');
    const firstTask = pool.enqueued[0];

    useSettingsStore.getState().setQuality(40);
    expect(useFileStore.getState().files[0].status).toBe('pending');

    firstTask.callbacks.onResult?.(id, new ArrayBuffer(4), 32, 4);
    await first;
    expect(useFileStore.getState().files[0].status).toBe('pending');
    expect(useFileStore.getState().files[0].result).toBeUndefined();

    const second = controller.run();
    await waitUntil(() => pool.enqueued.length >= 1, 'second enqueue');
    const secondEpoch = useFileStore.getState().files[0].taskEpoch;
    useFileStore.getState().cancelFile(id);
    useFileStore.getState().retryFile(id);
    expect(useFileStore.getState().files[0].taskEpoch).not.toBe(secondEpoch);

    pool.enqueued[0]?.callbacks.onError?.(id, 'stale boom');
    await second.catch(() => undefined);
    expect(useFileStore.getState().files[0].status).toBe('pending');
    expect(useFileStore.getState().files[0].error).toBeUndefined();
  });

  it('ignores late callbacks after delete and clear', async () => {
    useFileStore.getState().addFiles([
      new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    const [firstId, secondId] = useFileStore.getState().files.map((file) => file.id);
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 2,
      debounceMs: 0,
    });

    const running = controller.run();
    await waitUntil(() => pool.enqueued.length === 2, 'batch enqueue');
    const firstTask = pool.enqueued.find((task) => task.id === firstId)!;
    const secondTask = pool.enqueued.find((task) => task.id === secondId)!;

    useFileStore.getState().removeFile(firstId);
    firstTask.callbacks.onResult?.(firstId, new ArrayBuffer(8), 32, 8);
    expect(useFileStore.getState().getFile(firstId)).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    useFileStore.getState().clearAll();
    secondTask.callbacks.onResult?.(secondId, new ArrayBuffer(8), 32, 8);
    expect(useFileStore.getState().files).toHaveLength(0);
    await running;
  });

  it('retries a cancelled file and still processes a later file', async () => {
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const firstId = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const firstRun = controller.run();
    await Promise.resolve();
    useFileStore.getState().cancelFile(firstId);
    await firstRun;
    expect(useFileStore.getState().files[0].status).toBe('cancelled');

    useFileStore.getState().retryFile(firstId);
    const retryRun = controller.run();
    await waitUntil(() => pool.enqueued.some((task) => task.id === firstId), 'retry enqueue');
    pool.complete(firstId);
    await retryRun;
    expect(useFileStore.getState().files[0].status).toBe('done');

    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'b.jpg', { type: 'image/jpeg' })]);
    const secondId = useFileStore.getState().files[1].id;
    const secondRun = controller.run();
    await waitUntil(() => pool.enqueued.some((task) => task.id === secondId), 'second file enqueue');
    pool.complete(secondId);
    await secondRun;
    expect(useFileStore.getState().files[1].status).toBe('done');
  });

  it('combines the scheduler with WorkerPool abort so cancelled work does not complete', async () => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    const workerPool = new WorkerPool(1);
    setPoolForTests(workerPool);
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = useFileStore.getState().files[0].id;
    const controller = createAutoCompressController({
      getPool: () => workerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
    });

    const running = controller.run();
    await waitUntil(
      () => MockWorker.instances.some((worker) => worker.messages.length > 0),
      'worker dispatch',
    );

    useFileStore.getState().cancelFile(id);
    await running;
    expect(useFileStore.getState().files[0].status).toBe('cancelled');

    MockWorker.instances[0]?.emitResult(id);
    await Promise.resolve();
    expect(useFileStore.getState().files[0].status).toBe('cancelled');
    expect(useFileStore.getState().files[0].result).toBeUndefined();

    workerPool.destroy();
    setPoolForTests(null);
  });
});

describe('auto-compress settings invalidation and abort', () => {
  let pool: ControllablePool;

  function createController(overrides: Partial<AutoCompressDeps> = {}) {
    return createAutoCompressController({
      getPool: () => pool as unknown as WorkerPool,
      decodeImage: async () => pixels(),
      resizeImage: (data, width, height) => ({ data, width, height }),
      readImageDimensions: async () => ({ width: 2, height: 2 }),
      validateImageDimensions: () => null,
      getMainPipelineConcurrency: () => 1,
      debounceMs: 0,
      isPermanentImageError: () => false,
      ...overrides,
    });
  }

  beforeEach(() => {
    uuidCounter = 0;
    pool = new ControllablePool();
    setPoolForTests(pool as unknown as WorkerPool);
    useFileStore.setState({ files: [] });
    useSettingsStore.setState({ settings: { ...baseSettings, resize: { ...baseSettings.resize! } } });
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:result');
    vi.clearAllMocks();
  });

  afterEach(() => {
    setPoolForTests(null);
    vi.useRealTimers();
  });

  it('reprocesses with the latest quality after settings change during dimension read', async () => {
    const dimGate = createGate({ width: 2, height: 2 });
    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = useFileStore.getState().files[0].id;
    const controller = createController({
      readImageDimensions: () => dimGate.wait(),
    });

    const running = controller.run();
    await waitUntil(() => dimGate.hasEntered(), 'dimension barrier');
    expect(useFileStore.getState().files[0].status).toBe('pending');

    useSettingsStore.getState().setQuality(40);
    controller.schedule();
    dimGate.release();

    await waitUntil(
      () => pool.enqueued.some((task) => task.id === id && task.settings.quality === 40),
      'quality 40 enqueue',
    );
    expect(pool.enqueued.every((task) => task.settings.quality === 40)).toBe(true);
    pool.complete(id);
    await running;

    const file = useFileStore.getState().files[0];
    expect(file.status).toBe('done');
    expect(file.lastProcessedSettingsHash).toBe(getSettingsHash(useSettingsStore.getState().settings));
    expect(isResultExportable(file, useSettingsStore.getState().settings)).toBe(true);
  });

  it('reprocesses with the latest quality after settings change during File.arrayBuffer', async () => {
    const { source, gate } = gatedFile();
    useFileStore.getState().addFiles([source]);
    const id = useFileStore.getState().files[0].id;
    const controller = createController();

    const running = controller.run();
    await waitUntil(() => gate.hasEntered(), 'read barrier');
    expect(useFileStore.getState().files[0].status).toBe('pending');

    useSettingsStore.getState().setQuality(40);
    controller.schedule();
    gate.release();

    await waitUntil(
      () => pool.enqueued.some((task) => task.id === id && task.settings.quality === 40),
      'quality 40 enqueue',
    );
    expect(pool.enqueued.map((task) => task.settings.quality)).toEqual([40]);
    pool.complete(id);
    await running;

    expect(useFileStore.getState().files[0].status).toBe('done');
    expect(useFileStore.getState().files[0].lastProcessedSettingsHash).toBe(
      getSettingsHash(useSettingsStore.getState().settings),
    );
  });

  it('reprocesses a retained previous result after settings change during decode', async () => {
    const decodeGate = createGate(pixels());
    const id = seedDoneFile();
    const controller = createController({
      decodeImage: () => decodeGate.wait(),
    });

    useSettingsStore.getState().setQuality(40);
    expect(useFileStore.getState().files[0].status).toBe('pending');
    expect(useFileStore.getState().files[0].result?.previewUrl).toBe('blob:result-a');

    const running = controller.run();
    await waitUntil(() => decodeGate.hasEntered(), 'decode barrier');
    expect(useFileStore.getState().files[0].status).toBe('processing');

    useSettingsStore.getState().setQuality(30);
    controller.schedule();
    decodeGate.release();

    await waitUntil(
      () => pool.enqueued.some((task) => task.id === id && task.settings.quality === 30),
      'quality 30 enqueue',
    );
    expect(pool.enqueued.every((task) => task.settings.quality === 30)).toBe(true);
    pool.complete(id);
    await running;

    const file = useFileStore.getState().files[0];
    expect(file.status).toBe('done');
    expect(file.lastProcessedSettingsHash).toBe(getSettingsHash(useSettingsStore.getState().settings));
  });

  it('does not leave a first import stuck in processing after a read-stage quality change', async () => {
    const { source, gate } = gatedFile();
    useFileStore.getState().addFiles([source]);
    const id = useFileStore.getState().files[0].id;
    const controller = createController();

    const running = controller.run();
    await waitUntil(() => gate.hasEntered(), 'read barrier');
    useSettingsStore.getState().setQuality(40);
    controller.schedule();
    gate.release();
    await waitUntil(() => pool.enqueued.some((task) => task.id === id), 'reprocess enqueue');
    expect(pool.enqueued).toHaveLength(1);
    pool.complete(id);
    await running;

    expect(useFileStore.getState().files[0].status).not.toBe('processing');
    expect(useFileStore.getState().files[0].status).toBe('done');
  });

  it('stops retryable errors after abortAll even if schedule runs again', async () => {
    vi.useFakeTimers();
    useFileStore.getState().addFiles([
      new File([new ArrayBuffer(32)], 'processing.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'pending.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'error.jpg', { type: 'image/jpeg' }),
      new File([new ArrayBuffer(32)], 'done.jpg', { type: 'image/jpeg' }),
    ]);
    const [processingId, pendingId, errorId, doneId] = useFileStore.getState().files.map((file) => file.id);
    const doneHash = getSettingsHash(useSettingsStore.getState().settings);
    useFileStore.getState().updateFile(errorId, { status: 'error', error: 'transient failure' });
    useFileStore.getState().updateFile(doneId, {
      status: 'done',
      lastProcessedSettingsHash: doneHash,
      result: {
        blob: new Blob([new ArrayBuffer(4)]),
        size: 4,
        previewUrl: 'blob:done-keep',
      },
    });

    const controller = createController({ debounceMs: AUTO_COMPRESS_DEBOUNCE_MS });
    controller.schedule();
    await vi.advanceTimersByTimeAsync(AUTO_COMPRESS_DEBOUNCE_MS);
    await waitUntil(() => pool.enqueued.some((task) => task.id === processingId), 'processing enqueue');

    controller.abortAll();
    expect(useFileStore.getState().getFile(processingId)?.status).toBe('cancelled');
    expect(useFileStore.getState().getFile(pendingId)?.status).toBe('cancelled');
    expect(useFileStore.getState().getFile(errorId)?.status).toBe('cancelled');
    expect(useFileStore.getState().getFile(doneId)?.status).toBe('done');

    const enqueuedAfterAbort = pool.enqueued.length;
    controller.schedule();
    await vi.advanceTimersByTimeAsync(AUTO_COMPRESS_DEBOUNCE_MS + 50);
    await Promise.resolve();
    expect(pool.enqueued).toHaveLength(enqueuedAfterAbort);

    useFileStore.getState().retryFile(errorId);
    const retryRun = controller.run();
    await waitUntil(() => pool.enqueued.some((task) => task.id === errorId), 'explicit retry');
    pool.complete(errorId);
    await retryRun;
    expect(useFileStore.getState().getFile(errorId)?.status).toBe('done');

    useFileStore.getState().addFiles([new File([new ArrayBuffer(32)], 'fresh.jpg', { type: 'image/jpeg' })]);
    const freshId = useFileStore.getState().files.at(-1)!.id;
    const freshRun = controller.run();
    await waitUntil(() => pool.enqueued.some((task) => task.id === freshId), 'new file');
    pool.complete(freshId);
    await freshRun;
    expect(useFileStore.getState().getFile(freshId)?.status).toBe('done');
    expect(useFileStore.getState().getFile(doneId)?.result?.previewUrl).toBe('blob:done-keep');
  });

  it('restores matching result A when B has not started', async () => {
    const id = seedDoneFile();
    const controller = createController();

    useSettingsStore.getState().setQuality(40);
    expect(useFileStore.getState().files[0].status).toBe('pending');
    useSettingsStore.getState().setQuality(75);

    const restored = useFileStore.getState().getFile(id)!;
    expect(restored.status).toBe('done');
    expect(restored.result?.previewUrl).toBe('blob:result-a');
    expect(isResultExportable(restored, useSettingsStore.getState().settings)).toBe(true);

    controller.schedule();
    await Promise.resolve();
    expect(pool.enqueued).toHaveLength(0);
  });

  it('restores matching result A during B read and ignores the late B encode', async () => {
    const { source, gate } = gatedFile();
    useFileStore.getState().addFiles([source]);
    const id = useFileStore.getState().files[0].id;
    const hashA = getSettingsHash(useSettingsStore.getState().settings);
    useFileStore.getState().updateFile(id, {
      status: 'done',
      lastProcessedSettingsHash: hashA,
      result: {
        blob: new Blob([new ArrayBuffer(4)]),
        size: 4,
        previewUrl: 'blob:result-a',
      },
    });

    useSettingsStore.getState().setQuality(40);
    const controller = createController();
    const running = controller.run();
    await waitUntil(() => gate.hasEntered(), 'B read barrier');

    useSettingsStore.getState().setQuality(75);
    controller.schedule();
    gate.release();
    await running;

    const restored = useFileStore.getState().getFile(id)!;
    expect(restored.status).toBe('done');
    expect(restored.result?.previewUrl).toBe('blob:result-a');
    expect(pool.enqueued).toHaveLength(0);
    expect(isResultExportable(restored, useSettingsStore.getState().settings)).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:result-a');
  });

  it('restores matching result A during B encode and ignores the late B result', async () => {
    const id = seedDoneFile();
    useSettingsStore.getState().setQuality(40);
    const controller = createController();
    const running = controller.run();
    await waitUntil(() => pool.enqueued.some((task) => task.id === id), 'B enqueue');
    const lateTask = pool.enqueued[0];

    useSettingsStore.getState().setQuality(75);
    expect(useFileStore.getState().files[0].status).toBe('done');
    expect(useFileStore.getState().files[0].result?.previewUrl).toBe('blob:result-a');

    vi.mocked(URL.createObjectURL).mockReturnValue('blob:result-b');
    lateTask.callbacks.onResult?.(id, new ArrayBuffer(8), 32, 8);
    controller.schedule();
    await running.catch(() => undefined);

    const restored = useFileStore.getState().getFile(id)!;
    expect(restored.status).toBe('done');
    expect(restored.result?.previewUrl).toBe('blob:result-a');
    expect(isResultExportable(restored, useSettingsStore.getState().settings)).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:result-a');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result-b');
  });
});
