/**
 * Lazy singleton WorkerPool for the compression pipeline.
 *
 * The pool is created on first encode. Abort helpers no-op when no pool exists
 * so store tests and pre-enqueue cancel/remove do not construct Workers.
 */

import { WorkerPool, createCompatImageEngine, createImageProcessor } from '@pic-forge/worker';

let pool: WorkerPool | null = null;

export function getPool(): WorkerPool {
  if (!pool) pool = new WorkerPool();
  return pool;
}

export function abortFileProcessing(id: string): void {
  pool?.abortTask(id);
}

export function abortAllProcessing(): void {
  pool?.abortAll();
}

export function setPoolForTests(next: WorkerPool | null): void {
  if (pool && pool !== next) {
    pool.destroy();
  }
  pool = next;
}

// Session lifetime; Phase 4 can supply a qualified preferred engine here.
export const imageProcessor = createImageProcessor(createCompatImageEngine(getPool));
