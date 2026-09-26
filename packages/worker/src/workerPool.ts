/**
 * Worker pool for concurrent WASM encoding.
 *
 * Architecture:
 * - Main thread: decode (Canvas API) + resize (Canvas API)
 * - Worker: WASM encoding only
 * - Transfer: ImageData buffer → Worker → result ArrayBuffer back
 *
 * Workers are created on demand. A WASM heap only grows, so a Worker that has
 * encoded a large image is retired afterwards, and idle Workers are released
 * after a quiet period; the next task starts a fresh Worker.
 */

import type { CompressSettings } from '@pic-forge/codecs';
import type { OutputFormat } from '@pic-forge/codecs';

export interface TaskCallbacks {
  onProgress?: (taskId: string, progress: number) => void;
  onResult?: (taskId: string, resultBuffer: ArrayBuffer, originalSize: number, compressedSize: number) => void;
  onError?: (taskId: string, error: string) => void;
}

export interface WorkerPoolOptions {
  poolSize?: number;
  maxPoolSize?: number;
  /** Retire a Worker after a task with at least this many pixels. */
  recyclePixels?: number;
  /** Terminate Workers after this long without any queued or active task. */
  idleTimeoutMs?: number;
}

/**
 * `rgba`: raw target pixels. `png`: complete, already-sanitized PNG file bytes
 * that OxiPNG optimises without a decode/re-encode round trip.
 */
export type TaskInput = 'rgba' | 'png';

export interface EnqueueOptions {
  input?: TaskInput;
}

interface PendingTask {
  id: string;
  pixelBuffer: ArrayBuffer;
  width: number;
  height: number;
  originalSize: number;
  settings: CompressSettings;
  callbacks: TaskCallbacks;
  input: TaskInput;
}

interface ActiveTask {
  id: string;
  workerIndex: number;
  outputFormat: OutputFormat;
  pixels: number;
  callbacks: TaskCallbacks;
  timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_MAX_POOL_SIZE = 3;
const DEFAULT_TASK_TIMEOUT_MS = 45_000;
const AVIF_TASK_TIMEOUT_MS = 120_000;
const OXIPNG_TASK_TIMEOUT_MS = 60_000;
/** Extra watchdog time per megapixel above what the base timeout already covers. */
const TIMEOUT_MS_PER_MEGAPIXEL: Record<OutputFormat, number> = {
  mozjpeg: 2_000,
  webp: 2_000,
  oxipng: 4_000,
  avif: 6_000,
};
export const DEFAULT_RECYCLE_PIXELS = 16_000_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

export function getRecommendedWorkerPoolSize(
  hardwareConcurrency = getHardwareConcurrency(),
  maxPoolSize = DEFAULT_MAX_POOL_SIZE,
): number {
  const cores = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : 4;
  if (cores <= 2) return 1;
  if (cores <= 4) return Math.min(2, maxPoolSize);
  return Math.max(1, Math.min(maxPoolSize, cores - 1));
}

export function getFormatConcurrencyLimit(format: OutputFormat, poolSize: number): number {
  if (format === 'avif') return 1;
  if (format === 'oxipng') return Math.min(2, poolSize);
  return poolSize;
}

/**
 * Watchdog for one encode. The base values cover ordinary photos; large targets
 * get proportionally more time so a slow but progressing encode is not killed.
 * These are uncalibrated bounds, not performance expectations.
 */
export function getTaskTimeoutMs(format: OutputFormat, pixels = 0): number {
  const base =
    format === 'avif'
      ? AVIF_TASK_TIMEOUT_MS
      : format === 'oxipng'
        ? OXIPNG_TASK_TIMEOUT_MS
        : DEFAULT_TASK_TIMEOUT_MS;
  const scaled = (Math.max(0, pixels) / 1_000_000) * (TIMEOUT_MS_PER_MEGAPIXEL[format] ?? 6_000);
  return Math.max(base, Math.ceil(scaled / 1000) * 1000);
}

function getHardwareConcurrency(): number {
  if (typeof navigator === 'undefined') return 4;
  return navigator.hardwareConcurrency || 4;
}

export class WorkerPool {
  private readonly size: number;
  private readonly recyclePixels: number;
  private readonly idleTimeoutMs: number;
  private workers: Array<Worker | undefined> = [];
  private taskQueue: PendingTask[] = [];
  private activeTasks = new Map<string, ActiveTask>();
  private workerBusy: boolean[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(poolSizeOrOptions?: number | WorkerPoolOptions) {
    const options = typeof poolSizeOrOptions === 'number'
      ? { poolSize: poolSizeOrOptions }
      : poolSizeOrOptions;
    this.size = Math.max(
      1,
      options?.poolSize ?? getRecommendedWorkerPoolSize(getHardwareConcurrency(), options?.maxPoolSize),
    );
    this.recyclePixels = options?.recyclePixels ?? DEFAULT_RECYCLE_PIXELS;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.workerBusy = new Array(this.size).fill(false);
    this.workers = new Array(this.size).fill(undefined);
  }

  private ensureWorker(index: number): Worker {
    const existing = this.workers[index];
    if (existing) return existing;
    const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent) => {
      if (this.workers[index] !== worker) return;
      this.handleWorkerMessage(index, event.data);
    };

    worker.onerror = (event) => {
      if (this.workers[index] !== worker) return;
      console.error(`Worker ${index} error:`, event);
      // Find and fail the active task for this worker
      for (const [taskId, active] of this.activeTasks) {
        if (active.workerIndex === index) {
          this.activeTasks.delete(taskId);
          clearTimeout(active.timeoutId);
          active.callbacks.onError?.(taskId, `Worker error: ${event.message}`);
          break;
        }
      }
      this.retireWorker(index);
      this.workerBusy[index] = false;
      this.processNext();
    };

    this.workers[index] = worker;
    return worker;
  }

  /** Terminate a Worker; a later dispatch creates a fresh one with an empty heap. */
  private retireWorker(index: number): void {
    this.workers[index]?.terminate();
    this.workers[index] = undefined;
  }

  private finishTask(workerIndex: number, active: ActiveTask | undefined): void {
    this.workerBusy[workerIndex] = false;
    if (active && active.pixels >= this.recyclePixels) this.retireWorker(workerIndex);
  }

  private handleWorkerMessage(workerIndex: number, msg: any): void {
    const { type, payload } = msg;

    if (type === 'progress') {
      const active = this.activeTasks.get(payload.id);
      active?.callbacks.onProgress?.(payload.id, payload.progress);
      return;
    }

    if (type === 'result') {
      const active = this.activeTasks.get(payload.id);
      if (active) {
        clearTimeout(active.timeoutId);
        this.activeTasks.delete(payload.id);
      }
      this.finishTask(workerIndex, active);
      active?.callbacks.onResult?.(payload.id, payload.resultBuffer, payload.originalSize, payload.compressedSize);
      this.processNext();
      return;
    }

    if (type === 'error') {
      const active = this.activeTasks.get(payload.id);
      if (active) {
        clearTimeout(active.timeoutId);
        this.activeTasks.delete(payload.id);
      }
      this.finishTask(workerIndex, active);
      active?.callbacks.onError?.(payload.id, payload.error);
      this.processNext();
      return;
    }
  }

  private getFreeWorkerIndex(): number {
    return this.workerBusy.findIndex((busy) => !busy);
  }

  private processNext(): void {
    if (this.destroyed) return;
    this.updateIdleTimer();
    if (this.taskQueue.length === 0) return;

    let workerIndex = this.getFreeWorkerIndex();
    while (workerIndex !== -1 && this.taskQueue.length > 0) {
      const taskIndex = this.findDispatchableTaskIndex();
      if (taskIndex === -1) return;

      const [task] = this.taskQueue.splice(taskIndex, 1);
      const assignedWorkerIndex = workerIndex;
      let worker: Worker;
      try {
        worker = this.ensureWorker(assignedWorkerIndex);
      } catch (error) {
        // A Worker that cannot start fails this task only; the slot stays usable.
        task.callbacks.onError?.(task.id, `Worker error: ${error instanceof Error ? error.message : String(error)}`);
        workerIndex = this.getFreeWorkerIndex();
        continue;
      }
      this.workerBusy[assignedWorkerIndex] = true;

      const pixels = task.width * task.height;
      const timeoutMs = getTaskTimeoutMs(task.settings.outputFormat, pixels);

      // Set timeout to prevent permanent worker slot occupation
      const timeoutId = setTimeout(() => {
        console.warn(`Task ${task.id} timed out after ${timeoutMs}ms, terminating worker ${assignedWorkerIndex}`);
        this.activeTasks.delete(task.id);
        this.workerBusy[assignedWorkerIndex] = false;
        this.retireWorker(assignedWorkerIndex);
        task.callbacks.onError?.(task.id, `Task timed out after ${timeoutMs / 1000}s`);
        this.processNext();
      }, timeoutMs);

      this.activeTasks.set(task.id, {
        id: task.id,
        workerIndex: assignedWorkerIndex,
        outputFormat: task.settings.outputFormat,
        pixels,
        callbacks: task.callbacks,
        timeoutId,
      });

      try {
        worker.postMessage(
          {
            type: 'task',
            payload: {
              id: task.id,
              pixelBuffer: task.pixelBuffer,
              width: task.width,
              height: task.height,
              originalSize: task.originalSize,
              settings: task.settings,
              input: task.input,
            },
          },
          { transfer: [task.pixelBuffer] },
        );
      } catch (error) {
        clearTimeout(timeoutId);
        this.activeTasks.delete(task.id);
        this.workerBusy[assignedWorkerIndex] = false;
        task.callbacks.onError?.(task.id, `Worker error: ${error instanceof Error ? error.message : String(error)}`);
      }

      workerIndex = this.getFreeWorkerIndex();
    }
  }

  /** Release every Worker once nothing is queued or running for a while. */
  private updateIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.destroyed || this.activeTasks.size > 0 || this.taskQueue.length > 0) return;
    if (!this.workers.some(Boolean)) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.activeTasks.size > 0 || this.taskQueue.length > 0) return;
      for (let index = 0; index < this.size; index += 1) {
        if (!this.workerBusy[index]) this.retireWorker(index);
      }
    }, this.idleTimeoutMs);
  }

  private findDispatchableTaskIndex(): number {
    for (let i = 0; i < this.taskQueue.length; i += 1) {
      const task = this.taskQueue[i];
      const activeForFormat = Array.from(this.activeTasks.values()).filter(
        (active) => active.outputFormat === task.settings.outputFormat,
      ).length;
      const limit = getFormatConcurrencyLimit(task.settings.outputFormat, this.size);
      if (activeForFormat < limit) return i;
    }

    return -1;
  }

  /**
   * Enqueue a task. pixelBuffer is transferred (not copied) to the Worker.
   */
  enqueue(
    id: string,
    pixelBuffer: ArrayBuffer,
    width: number,
    height: number,
    originalSize: number,
    settings: CompressSettings,
    callbacks: TaskCallbacks,
    options: EnqueueOptions = {},
  ): void {
    if (this.destroyed) throw new Error('WorkerPool has been destroyed');
    this.taskQueue.push({
      id,
      pixelBuffer,
      width,
      height,
      originalSize,
      settings,
      callbacks,
      input: options.input ?? 'rgba',
    });
    this.processNext();
  }

  /**
   * Cancel a specific task by id.
   * - Queued tasks are removed from the queue.
   * - Active tasks terminate their Worker; synchronous WASM cannot be interrupted otherwise.
   */
  abortTask(id: string): void {
    // Remove from queue
    const queueIndex = this.taskQueue.findIndex((t) => t.id === id);
    if (queueIndex !== -1) {
      const [task] = this.taskQueue.splice(queueIndex, 1);
      task.callbacks.onError?.(id, 'Task cancelled');
      this.updateIdleTimer();
      return;
    }

    const active = this.activeTasks.get(id);
    if (active) {
      clearTimeout(active.timeoutId);
      this.activeTasks.delete(id);
      this.retireWorker(active.workerIndex);
      active.callbacks.onError?.(id, 'Task cancelled');
      this.workerBusy[active.workerIndex] = false;
      this.processNext();
    }
  }

  get activeCount(): number { return this.activeTasks.size; }
  get queueSize(): number { return this.taskQueue.length; }
  get poolSize(): number { return this.size; }
  /** Workers currently alive (created and not retired). */
  get liveWorkerCount(): number { return this.workers.filter(Boolean).length; }

  abortAll(): void {
    // Notify callbacks for queued tasks before discarding
    for (const task of this.taskQueue) {
      task.callbacks.onError?.(task.id, 'Task aborted');
    }
    this.taskQueue = [];

    for (let index = 0; index < this.size; index += 1) this.retireWorker(index);

    // Notify callbacks for active tasks before discarding
    for (const [, active] of this.activeTasks) {
      clearTimeout(active.timeoutId);
      active.callbacks.onError?.(active.id, 'Task aborted');
    }
    this.activeTasks.clear();
    this.workerBusy = new Array(this.size).fill(false);
    this.updateIdleTimer();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;

    // Notify callbacks for queued tasks before discarding
    for (const task of this.taskQueue) {
      task.callbacks.onError?.(task.id, 'Task aborted');
    }
    this.taskQueue = [];

    for (let index = 0; index < this.size; index += 1) this.retireWorker(index);

    // Notify callbacks for active tasks before discarding
    for (const [, active] of this.activeTasks) {
      clearTimeout(active.timeoutId);
      active.callbacks.onError?.(active.id, 'Task aborted');
    }
    this.activeTasks.clear();
    this.workerBusy = [];
  }
}
