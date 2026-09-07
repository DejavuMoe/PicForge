/**
 * Auto-compress runtime: debounce, bounded concurrency, cancel/retry, and
 * task-epoch checks around decode, enqueue, and store write-back.
 *
 * The React hook is a thin subscriber around this controller.
 */

import { decodeImage, resizeImage } from '@pic-forge/worker';
import type { CompressSettings } from '@pic-forge/codecs';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FORMAT_OPTIONS, type ImageFile } from '../types';
import { getEffectiveSettings, getSettingsHash } from '../utils/settingsUtils';
import {
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  isPermanentImageError,
  readImageDimensions,
  runWithConcurrency,
  validateImageDimensions,
} from '../utils/processingGuards';
import { abortAllProcessing, getPool } from './processingPool';

export const AUTO_COMPRESS_DEBOUNCE_MS = 300;
const MAX_RETRIES = 2;

export interface AutoCompressDeps {
  decodeImage: typeof decodeImage;
  resizeImage: typeof resizeImage;
  getPool: typeof getPool;
  readImageDimensions: typeof readImageDimensions;
  validateImageDimensions: typeof validateImageDimensions;
  getImageSafetyLimits: typeof getImageSafetyLimits;
  getMainPipelineConcurrency: typeof getMainPipelineConcurrency;
  isPermanentImageError: typeof isPermanentImageError;
  debounceMs: number;
  maxRetries: number;
}

const defaultDeps: AutoCompressDeps = {
  decodeImage,
  resizeImage,
  getPool,
  readImageDimensions,
  validateImageDimensions,
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  isPermanentImageError,
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
    if (isPermanent(file.error)) return false;
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
    fileBuffer: ArrayBuffer,
    settings: CompressSettings,
    settingsHash: string,
    epoch: number,
  ): Promise<void> {
    if (!isTaskCurrent(fileId, epoch, settingsHash)) return;

    useFileStore.getState().updateFile(fileId, { status: 'processing', progress: 0 });

    const { data, width, height } = await deps.decodeImage(fileBuffer);
    if (!isTaskCurrent(fileId, epoch, settingsHash)) return;

    useFileStore.getState().updateFile(fileId, { progress: 30 });

    let pixelData = data;
    let finalWidth = width;
    let finalHeight = height;

    if (settings.resize?.enabled) {
      const resized = deps.resizeImage(data, width, height, settings.resize);
      pixelData = resized.data;
      finalWidth = resized.width;
      finalHeight = resized.height;
    }

    if (!isTaskCurrent(fileId, epoch, settingsHash)) return;
    useFileStore.getState().updateFile(fileId, { progress: 50 });

    const pixelBuffer = pixelData.buffer.slice(0) as ArrayBuffer;
    if (!isTaskCurrent(fileId, epoch, settingsHash)) return;

    const pool = deps.getPool();

    return new Promise<void>((resolve, reject) => {
      if (!isTaskCurrent(fileId, epoch, settingsHash)) {
        resolve();
        return;
      }

      pool.enqueue(fileId, pixelBuffer, finalWidth, finalHeight, fileBuffer.byteLength, settings, {
        onProgress: (taskId: string, progress: number) => {
          if (!isTaskCurrent(taskId, epoch, settingsHash)) return;
          useFileStore.getState().updateFile(taskId, { progress });
        },
        onResult: (taskId: string, resultBuffer: ArrayBuffer, _orig: number, compressed: number) => {
          const formatOption = FORMAT_OPTIONS.find((f) => f.value === settings.outputFormat);
          const mime = formatOption?.mimeType ?? 'application/octet-stream';
          const blob = new Blob([resultBuffer], { type: mime });
          const resultUrl = URL.createObjectURL(blob);

          if (!isTaskCurrent(taskId, epoch, settingsHash)) {
            URL.revokeObjectURL(resultUrl);
            resolve();
            return;
          }

          const current = useFileStore.getState().getFile(taskId);
          if (!current) {
            URL.revokeObjectURL(resultUrl);
            resolve();
            return;
          }

          useFileStore.getState().updateFile(taskId, {
            status: 'done',
            progress: 100,
            lastProcessedSettingsHash: settingsHash,
            result: { blob, size: compressed, previewUrl: resultUrl },
            outputMeta: {
              originalWidth: width,
              originalHeight: height,
              outputWidth: finalWidth,
              outputHeight: finalHeight,
              settingsHash,
            },
          });
          resolve();
        },
        onError: (taskId: string, error: string) => {
          if (!isTaskCurrent(taskId, epoch, settingsHash)) {
            resolve();
            return;
          }
          if (error === 'Task cancelled' || error === 'Task aborted') {
            const current = useFileStore.getState().getFile(taskId);
            if (current && current.status !== 'cancelled') {
              useFileStore.getState().updateFile(taskId, {
                status: 'cancelled',
                progress: 0,
                error: undefined,
              });
            }
            resolve();
            return;
          }
          useFileStore.getState().updateFile(taskId, { status: 'error', progress: 0, error });
          reject(new Error(error));
        },
      });
    });
  }

  async function processAllPending(batchGeneration: number): Promise<void> {
    const currentPending = useFileStore.getState().files.filter((file) => {
      if (batchGeneration !== runGeneration) return false;
      if (!isAutoCompressCandidate(file, retryCount, deps.maxRetries, deps.isPermanentImageError)) {
        return false;
      }
      if (file.status === 'error') {
        retryCount.set(file.id, (retryCount.get(file.id) ?? 0) + 1);
      }
      return true;
    });

    if (currentPending.length === 0) return;

    await runWithConcurrency(
      currentPending,
      deps.getMainPipelineConcurrency(),
      async (file) => {
        if (batchGeneration !== runGeneration) return;

        const current = useFileStore.getState().getFile(file.id);
        if (!current || (current.status !== 'pending' && current.status !== 'error')) return;

        const settings = getEffectiveSettings(current, useSettingsStore.getState().settings);
        const settingsHash = getSettingsHash(settings);
        const epoch = current.taskEpoch ?? 0;

        try {
          const dimensions = await deps.readImageDimensions(current.file);
          if (
            batchGeneration !== runGeneration
            || !isTaskCurrent(current.id, epoch, settingsHash)
          ) {
            return;
          }

          const dimensionError = deps.validateImageDimensions(dimensions, deps.getImageSafetyLimits());
          if (dimensionError) {
            retryCount.set(current.id, deps.maxRetries);
            if (!isTaskCurrent(current.id, epoch, settingsHash)) return;
            useFileStore.getState().updateFile(current.id, {
              status: 'error',
              progress: 0,
              error: dimensionError,
            });
            return;
          }

          const stillCurrent = useFileStore.getState().getFile(current.id);
          if (
            !stillCurrent
            || (stillCurrent.status !== 'pending' && stillCurrent.status !== 'error')
            || (stillCurrent.taskEpoch ?? 0) !== epoch
          ) {
            return;
          }

          const buffer = await current.file.arrayBuffer();
          if (
            batchGeneration !== runGeneration
            || !isTaskCurrent(current.id, epoch, settingsHash)
          ) {
            return;
          }

          await processFile(current.id, buffer, settings, settingsHash, epoch);
          const processed = useFileStore.getState().getFile(current.id);
          if (processed?.status === 'done') retryCount.delete(current.id);
        } catch (err) {
          if (!isTaskCurrent(current.id, epoch, settingsHash)) return;
          useFileStore.getState().updateFile(current.id, {
            status: 'error',
            progress: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
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
    processAllPending: () => processAllPending(runGeneration),
    run,
    retryCount,
    isProcessing: () => processing,
  };
}
