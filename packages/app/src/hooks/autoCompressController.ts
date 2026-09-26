/**
 * Auto-compress runtime: debounce, bounded concurrency, cancel/retry, and
 * task-epoch checks around engine execution and store write-back.
 *
 * Scheduling: up to getMainPipelineConcurrency() tasks run at once, each after
 * reserving its estimated peak memory in the page-wide budget, so small images
 * use every encoder Worker while large ones run alone. The selected image is
 * taken first, including when a settings change requeues it mid-batch.
 *
 * The React hook is a thin subscriber around this controller.
 */

import { inspectAnimation, resolveResizeGeometry, type ImageEngine } from '@pic-forge/worker';
import type { CompressSettings } from '@pic-forge/codecs';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FORMAT_OPTIONS, type ImageFile } from '../types';
import { getEffectiveSettings, getSettingsHash } from '../utils/settingsUtils';
import {
  classifyImageError,
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  isPermanentImageError,
  readImageDimensions,
  validateImageDimensions,
  validateImageTarget,
  type ImageDimensions,
} from '../utils/processingGuards';
import {
  estimateAnimationCost,
  estimateCompressionCost,
  getProcessingBudget,
  type ResourceBudget,
} from '../utils/resourceBudget';
import { abortAllProcessing, imageProcessor } from './processingPool';

export const AUTO_COMPRESS_DEBOUNCE_MS = 300;
const MAX_RETRIES = 2;

export interface AutoCompressDeps {
  processImage: ImageEngine['process'];
  readImageDimensions: typeof readImageDimensions;
  validateImageDimensions: typeof validateImageDimensions;
  validateImageTarget: typeof validateImageTarget;
  getImageSafetyLimits: typeof getImageSafetyLimits;
  getMainPipelineConcurrency: typeof getMainPipelineConcurrency;
  isPermanentImageError: typeof isPermanentImageError;
  estimateTaskCost: typeof estimateTaskCost;
  getBudget: () => ResourceBudget;
  debounceMs: number;
  maxRetries: number;
}

/** Estimated peak bytes of one task, from normalized source dimensions and its settings. */
export async function estimateTaskCost(
  file: File,
  dimensions: ImageDimensions,
  settings: CompressSettings,
): Promise<number> {
  const geometry = settings.resize?.enabled
    ? resolveResizeGeometry(dimensions.width, dimensions.height, settings.resize)
    : { targetWidth: dimensions.width, targetHeight: dimensions.height };
  const target = { width: geometry.targetWidth, height: geometry.targetHeight };
  const animation = await inspectAnimation(file).catch(() => null);
  return animation
    ? estimateAnimationCost(file.size, target)
    : estimateCompressionCost(dimensions, target, settings.outputFormat);
}

const defaultDeps: AutoCompressDeps = {
  processImage: imageProcessor.process,
  readImageDimensions,
  validateImageDimensions,
  validateImageTarget,
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  isPermanentImageError,
  estimateTaskCost,
  getBudget: getProcessingBudget,
  debounceMs: AUTO_COMPRESS_DEBOUNCE_MS,
  maxRetries: MAX_RETRIES,
};

export function isAutoCompressCandidate(
  file: ImageFile,
  retryCount: Map<string, number>,
  maxRetries: number,
  isPermanent: (error?: string) => boolean,
): boolean {
  if (file.status === 'pending') return true;
  if (file.status === 'cancelled' || file.status === 'done' || file.status === 'processing') {
    return false;
  }
  if (file.status === 'error') {
    const permanent = file.errorClass ? file.errorClass !== 'runtime' : isPermanent(file.error);
    if (permanent) return false;
    const count = retryCount.get(file.id) ?? 0;
    return count < maxRetries;
  }
  return false;
}

export function isTaskCurrent(fileId: string, epoch: number, settingsHash?: string): boolean {
  const file = useFileStore.getState().getFile(fileId);
  if (!file) return false;
  if ((file.taskEpoch ?? 0) !== epoch) return false;
  if (file.status === 'cancelled') return false;
  if (settingsHash !== undefined) {
    const currentHash = getSettingsHash(
      getEffectiveSettings(file, useSettingsStore.getState().settings),
    );
    if (currentHash !== settingsHash) return false;
  }
  return true;
}

export function createAutoCompressController(partialDeps: Partial<AutoCompressDeps> = {}) {
  const deps = { ...defaultDeps, ...partialDeps };
  const retryCount = new Map<string, number>();
  /** Files whose task is running in this controller, across overlapping runs. */
  const inFlight = new Set<string>();
  /**
   * Pending files a run skipped because a stale task for them was still in flight
   * (for example Cancel all, then Retry before the old decode finished). They are
   * rescheduled when that task ends, because a stale task writes nothing back.
   */
  const deferred = new Set<string>();
  let priorityId: string | null = null;
  let processing = false;
  let needsReprocess = false;
  let runGeneration = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDebounce() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  async function processFile(
    fileId: string,
    source: Blob,
    settings: CompressSettings,
    settingsHash: string,
    epoch: number,
    cost: number,
  ): Promise<void> {
    if (!isTaskCurrent(fileId, epoch, settingsHash)) return;

    const abort = new AbortController();
    const unsubscribe = useFileStore.subscribe(() => {
      if (!isTaskCurrent(fileId, epoch, settingsHash)) abort.abort();
    });
    let release: (() => void) | undefined;
    try {
      release = await deps.getBudget().acquire(cost, abort.signal);
      if (!isTaskCurrent(fileId, epoch, settingsHash)) return;
      const result = await deps.processImage(
        {
          id: fileId,
          source,
          settings,
          onProgress: (progress) => {
            if (!isTaskCurrent(fileId, epoch, settingsHash)) return;
            useFileStore.getState().updateFile(fileId, { status: 'processing', progress });
          },
        },
        abort.signal,
      );
      if (!isTaskCurrent(fileId, epoch, settingsHash)) return;
      const mime =
        FORMAT_OPTIONS.find((f) => f.value === settings.outputFormat)?.mimeType ??
        'application/octet-stream';
      const blob = new Blob([result.buffer], { type: mime });
      const resultUrl = URL.createObjectURL(blob);
      useFileStore.getState().updateFile(fileId, {
        status: 'done',
        progress: 100,
        lastProcessedSettingsHash: settingsHash,
        result: { blob, size: result.outputSize, previewUrl: resultUrl },
        outputMeta: {
          originalWidth: result.originalWidth,
          originalHeight: result.originalHeight,
          outputWidth: result.width,
          outputHeight: result.height,
          settingsHash,
        },
      });
    } catch (error) {
      if (!isTaskCurrent(fileId, epoch, settingsHash)) return;
      if (error instanceof Error && error.name === 'AbortError') {
        useFileStore.getState().updateFile(fileId, {
          status: 'cancelled',
          progress: 0,
          error: undefined,
          errorClass: undefined,
        });
        return;
      }
      throw error;
    } finally {
      release?.();
      unsubscribe();
    }
  }

  function setError(id: string, error: string, errorClass: ImageFile['errorClass']) {
    useFileStore.getState().updateFile(id, { status: 'error', progress: 0, error, errorClass });
  }

  async function processQueued(
    id: string,
    batchGeneration: number,
    started: Map<string, number>,
  ): Promise<void> {
    const current = useFileStore.getState().getFile(id);
    if (!current || (current.status !== 'pending' && current.status !== 'error')) return;

    const settings = getEffectiveSettings(current, useSettingsStore.getState().settings);
    const settingsHash = getSettingsHash(settings);
    const epoch = current.taskEpoch ?? 0;
    started.set(id, epoch);
    inFlight.add(id);
    let phase: 'preflight' | 'process' = 'preflight';

    try {
      const dimensions = await deps.readImageDimensions(current.file);
      if (batchGeneration !== runGeneration || !isTaskCurrent(id, epoch, settingsHash)) return;

      const limits = deps.getImageSafetyLimits();
      const dimensionError = deps.validateImageDimensions(dimensions, limits);
      if (dimensionError) {
        retryCount.set(id, deps.maxRetries);
        setError(id, dimensionError, 'input');
        return;
      }

      const targetError = deps.validateImageTarget(dimensions, settings.resize, limits);
      if (targetError) {
        retryCount.set(id, deps.maxRetries);
        setError(id, targetError, classifyImageError(targetError));
        return;
      }

      const stillCurrent = useFileStore.getState().getFile(id);
      if (
        !stillCurrent ||
        (stillCurrent.status !== 'pending' && stillCurrent.status !== 'error') ||
        (stillCurrent.taskEpoch ?? 0) !== epoch
      ) {
        return;
      }

      const cost = await deps.estimateTaskCost(current.file, dimensions, settings);
      phase = 'process';
      await processFile(id, current.file, settings, settingsHash, epoch, cost);
      const processed = useFileStore.getState().getFile(id);
      if (processed?.status === 'done') retryCount.delete(id);
    } catch (err) {
      if (!isTaskCurrent(id, epoch, settingsHash)) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(id, message, classifyImageError(message, phase));
    } finally {
      inFlight.delete(id);
      if (deferred.delete(id)) schedule();
    }
  }

  async function processAllPending(batchGeneration: number): Promise<void> {
    const queue = useFileStore
      .getState()
      .files.filter((file) => {
        if (batchGeneration !== runGeneration) return false;
        if (
          !isAutoCompressCandidate(file, retryCount, deps.maxRetries, deps.isPermanentImageError)
        ) {
          return false;
        }
        if (file.status === 'error') {
          retryCount.set(file.id, (retryCount.get(file.id) ?? 0) + 1);
        }
        return true;
      })
      .map((file) => file.id);

    if (queue.length === 0) return;
    const started = new Map<string, number>();

    // The selected file goes first. It may also re-enter once a settings change has
    // given it a new epoch, instead of waiting for the rest of this batch.
    const next = (): string | undefined => {
      const selected = priorityId ? useFileStore.getState().getFile(priorityId) : undefined;
      if (
        selected &&
        selected.status === 'pending' &&
        started.get(selected.id) !== (selected.taskEpoch ?? 0)
      ) {
        if (!inFlight.has(selected.id)) {
          const index = queue.indexOf(selected.id);
          if (index !== -1) queue.splice(index, 1);
          return selected.id;
        }
        deferred.add(selected.id);
      }
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (!inFlight.has(id)) return id;
        deferred.add(id);
      }
      return undefined;
    };

    const runner = async () => {
      for (let id = next(); id !== undefined; id = next()) {
        if (batchGeneration !== runGeneration) return;
        await processQueued(id, batchGeneration, started);
      }
    };
    const limit = Math.max(1, Math.floor(deps.getMainPipelineConcurrency()));
    await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, runner));
  }

  async function run(): Promise<void> {
    const gen = ++runGeneration;
    processing = true;
    needsReprocess = false;

    await processAllPending(gen);

    if (gen !== runGeneration) return;

    processing = false;
    if (needsReprocess) {
      needsReprocess = false;
      await run();
    }
  }

  function schedule(): void {
    const pendingFiles = useFileStore.getState().files.filter((file) =>
      isAutoCompressCandidate(file, retryCount, deps.maxRetries, deps.isPermanentImageError),
    );
    if (pendingFiles.length === 0) return;

    if (processing) {
      needsReprocess = true;
      return;
    }

    clearDebounce();
    debounceTimer = setTimeout(() => {
      void run();
    }, deps.debounceMs);
  }

  function abortAll(): void {
    runGeneration += 1;
    processing = false;
    needsReprocess = false;
    clearDebounce();
    useFileStore.getState().cancelIncompleteFiles();
    abortAllProcessing();
  }

  return {
    schedule,
    abortAll,
    clearDebounce,
    /** Prefer this file (the one the user is viewing) when choosing the next task. */
    setPriority: (id: string | null) => {
      priorityId = id;
    },
    processAllPending: () => processAllPending(runGeneration),
    run,
    retryCount,
    isProcessing: () => processing,
  };
}
