/**
 * Worker pool for concurrent WASM encoding.
 *
 * Architecture:
 * - Main thread: decode (Canvas API) + resize (Canvas API)
 * - Worker: WASM encoding only
 * - Transfer: ImageData buffer → Worker → result ArrayBuffer back
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
}

interface PendingTask {
  id: string;
  pixelBuffer: ArrayBuffer;
  width: number;
  height: number;
  originalSize: number;
  settings: CompressSettings;
  callbacks: TaskCallbacks;
}

interface ActiveTask {
  id: string;
  workerIndex: number;
  outputFormat: OutputFormat;
  callbacks: TaskCallbacks;
  timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_MAX_POOL_SIZE = 3;
const DEFAULT_TASK_TIMEOUT_MS = 45_000;
const AVIF_TASK_TIMEOUT_MS = 120_000;
const OXIPNG_TASK_TIMEOUT_MS = 60_000;

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

function getTaskTimeoutMs(format: OutputFormat): number {
  if (format === 'avif') return AVIF_TASK_TIMEOUT_MS;
  if (format === 'oxipng') return OXIPNG_TASK_TIMEOUT_MS;
  return DEFAULT_TASK_TIMEOUT_MS;
}

function getHardwareConcurrency(): number {
  if (typeof navigator === 'undefined') return 4;
  return navigator.hardwareConcurrency || 4;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: PendingTask[] = [];
  private activeTasks = new Map<string, ActiveTask>();
  private workerBusy: boolean[] = [];
  private cancelledTasks = new Set<string>();
  private destroyed = false;

  constructor(poolSizeOrOptions?: number | WorkerPoolOptions) {
    const options = typeof poolSizeOrOptions === 'number'
      ? { poolSize: poolSizeOrOptions }
      : poolSizeOrOptions;
    const size = options?.poolSize
      ?? getRecommendedWorkerPoolSize(getHardwareConcurrency(), options?.maxPoolSize);
    this.initWorkers(size);
  }

  private initWorkers(size: number): void {
    for (let i = 0; i < size; i++) {
      this.createWorker(i);
    }
  }

  private createWorker(index: number): void {
    const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent) => {
      this.handleWorkerMessage(index, event.data);
    };

    worker.onerror = (event) => {
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
      this.workers[index].terminate();
      this.createWorker(index);
      this.workerBusy[index] = false;
      this.processNext();
    };

    this.workers[index] = worker;
    this.workerBusy[index] = false;
  }

  private handleWorkerMessage(workerIndex: number, msg: any): void {
    const { type, payload } = msg;

    // Check if task was cancelled while processing
    if (payload?.id && this.cancelledTasks.has(payload.id)) {
      const active = this.activeTasks.get(payload.id);
      if (active) {
        clearTimeout(active.timeoutId);
        this.activeTasks.delete(payload.id);
      }
      this.cancelledTasks.delete(payload.id);
      this.workerBusy[workerIndex] = false;
      this.processNext();
      return;
    }

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
      this.workerBusy[workerIndex] = false;
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
      this.workerBusy[workerIndex] = false;
      active?.callbacks.onError?.(payload.id, payload.error);
      this.processNext();
      return;
    }
  }

  private getFreeWorkerIndex(): number {
    return this.workerBusy.findIndex((busy) => !busy);
  }

  private processNext(): void {
    if (this.destroyed || this.taskQueue.length === 0) return;

    let workerIndex = this.getFreeWorkerIndex();
    while (workerIndex !== -1 && this.taskQueue.length > 0) {
      const taskIndex = this.findDispatchableTaskIndex();
      if (taskIndex === -1) return;

      const [task] = this.taskQueue.splice(taskIndex, 1);
      const assignedWorkerIndex = workerIndex;
      this.workerBusy[assignedWorkerIndex] = true;

      const timeoutMs = getTaskTimeoutMs(task.settings.outputFormat);

      // Set timeout to prevent permanent worker slot occupation
      const timeoutId = setTimeout(() => {
        console.warn(`Task ${task.id} timed out after ${timeoutMs}ms, terminating worker ${assignedWorkerIndex}`);
        this.activeTasks.delete(task.id);
        this.cancelledTasks.delete(task.id);
        this.workerBusy[assignedWorkerIndex] = false;
        this.workers[assignedWorkerIndex].terminate();
        task.callbacks.onError?.(task.id, `Task timed out after ${timeoutMs / 1000}s`);
        // Recreate the terminated worker
        this.createWorker(assignedWorkerIndex);
        this.processNext();
      }, timeoutMs);

      this.activeTasks.set(task.id, {
        id: task.id,
        workerIndex: assignedWorkerIndex,
        outputFormat: task.settings.outputFormat,
        callbacks: task.callbacks,
        timeoutId,
      });

      this.workers[assignedWorkerIndex].postMessage(
        {
          type: 'task',
          payload: {
            id: task.id,
            pixelBuffer: task.pixelBuffer,
            width: task.width,
            height: task.height,
            originalSize: task.originalSize,
            settings: task.settings,
          },
        },
        { transfer: [task.pixelBuffer] },
      );

      workerIndex = this.getFreeWorkerIndex();
    }
  }

  private findDispatchableTaskIndex(): number {
    for (let i = 0; i < this.taskQueue.length; i += 1) {
      const task = this.taskQueue[i];
      const activeForFormat = Array.from(this.activeTasks.values()).filter(
        (active) => active.outputFormat === task.settings.outputFormat,
      ).length;
      const limit = getFormatConcurrencyLimit(task.settings.outputFormat, this.workers.length);
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
  ): void {
    if (this.destroyed) throw new Error('WorkerPool has been destroyed');
    this.taskQueue.push({ id, pixelBuffer, width, height, originalSize, settings, callbacks });
    this.processNext();
  }

  /**
   * Cancel a specific task by id.
   * - Queued tasks are removed from the queue.
   * - Active tasks are marked as cancelled; the worker will discard the result when it returns.
   */
  abortTask(id: string): void {
    // Remove from queue
    const queueIndex = this.taskQueue.findIndex((t) => t.id === id);
    if (queueIndex !== -1) {
      const [task] = this.taskQueue.splice(queueIndex, 1);
      task.callbacks.onError?.(id, 'Task cancelled');
      return;
    }

    // Mark active task as cancelled
    const active = this.activeTasks.get(id);
    if (active) {
      clearTimeout(active.timeoutId);
      this.activeTasks.delete(id);
      this.cancelledTasks.delete(id);
      this.workers[active.workerIndex].terminate();
      active.callbacks.onError?.(id, 'Task cancelled');
      this.createWorker(active.workerIndex);
      this.workerBusy[active.workerIndex] = false;
      this.processNext();
    }
  }

  get activeCount(): number { return this.activeTasks.size; }
  get queueSize(): number { return this.taskQueue.length; }
  get poolSize(): number { return this.workers.length; }

  abortAll(): void {
    // Notify callbacks for queued tasks before discarding
    for (const task of this.taskQueue) {
      task.callbacks.onError?.(task.id, 'Task aborted');
    }
    this.taskQueue = [];

    const size = this.workers.length;
    for (const worker of this.workers) worker.terminate();

    // Notify callbacks for active tasks before discarding
    for (const [, active] of this.activeTasks) {
      clearTimeout(active.timeoutId);
      active.callbacks.onError?.(active.id, 'Task aborted');
    }
    this.activeTasks.clear();
    this.cancelledTasks.clear();

    this.workers = [];
    this.workerBusy = [];
    this.initWorkers(size);
  }

  destroy(): void {
    this.destroyed = true;

    // Notify callbacks for queued tasks before discarding
    for (const task of this.taskQueue) {
      task.callbacks.onError?.(task.id, 'Task aborted');
    }
    this.taskQueue = [];

    for (const worker of this.workers) worker.terminate();

    // Notify callbacks for active tasks before discarding
    for (const [, active] of this.activeTasks) {
      clearTimeout(active.timeoutId);
      active.callbacks.onError?.(active.id, 'Task aborted');
    }
    this.workers = [];
    this.activeTasks.clear();
    this.cancelledTasks.clear();
    this.workerBusy = [];
  }
}
