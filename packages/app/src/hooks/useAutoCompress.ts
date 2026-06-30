/**
 * useAutoCompress — watches for settings changes and file additions,
 * automatically triggers compression with debounce.
 *
 * Global files follow the global settings; custom files own full settings snapshots.
 * Main-thread decode/resize is intentionally bounded to avoid memory spikes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { WorkerPool, decodeImage, resizeImage } from '@pic-forge/worker';
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

let pool: WorkerPool | null = null;

function getPool(): WorkerPool {
  if (!pool) pool = new WorkerPool();
  return pool;
}

export { getPool };

/**
 * Process a single file using the Worker pool.
 * Returns a Promise that resolves when processing is complete.
 */
async function processFile(
  fileId: string,
  fileBuffer: ArrayBuffer,
  settings: CompressSettings,
  settingsHash: string,
  updateFile: (id: string, update: Partial<ImageFile>) => void,
): Promise<void> {
  const pool = getPool();

  updateFile(fileId, { status: 'processing', progress: 0 });

  const { data, width, height } = await decodeImage(fileBuffer);
  updateFile(fileId, { progress: 30 });

  let pixelData = data;
  let finalWidth = width;
  let finalHeight = height;

  if (settings.resize?.enabled) {
    const resized = resizeImage(data, width, height, settings.resize);
    pixelData = resized.data;
    finalWidth = resized.width;
    finalHeight = resized.height;
  }
  updateFile(fileId, { progress: 50 });

  const pixelBuffer = pixelData.buffer.slice(0) as ArrayBuffer;

  return new Promise<void>((resolve, reject) => {
    pool.enqueue(fileId, pixelBuffer, finalWidth, finalHeight, fileBuffer.byteLength, settings, {
      onProgress: (taskId: string, progress: number) => {
        updateFile(taskId, { progress });
      },
      onResult: (taskId: string, resultBuffer: ArrayBuffer, _orig: number, compressed: number) => {
        const formatOption = FORMAT_OPTIONS.find((f) => f.value === settings.outputFormat);
        const mime = formatOption?.mimeType ?? 'application/octet-stream';
        const blob = new Blob([resultBuffer], { type: mime });
        const resultUrl = URL.createObjectURL(blob);

        const current = useFileStore.getState().getFile(taskId);
        if (!current) {
          URL.revokeObjectURL(resultUrl);
          resolve();
          return;
        }

        const currentSettings = getEffectiveSettings(
          current,
          useSettingsStore.getState().settings,
        );
        const currentHash = getSettingsHash(currentSettings);

        if (currentHash !== settingsHash) {
          URL.revokeObjectURL(resultUrl);
          updateFile(taskId, { status: 'pending', progress: 0 });
          resolve();
          return;
        }

        updateFile(taskId, {
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
        if (error === 'Task cancelled' || error === 'Task aborted') {
          updateFile(taskId, { status: 'pending', progress: 0, error: undefined });
          resolve();
          return;
        }
        updateFile(taskId, { status: 'error', progress: 0, error });
        reject(new Error(error));
      },
    });
  });
}

export function useAutoCompress() {
  const files = useFileStore((s) => s.files);
  const updateFile = useFileStore((s) => s.updateFile);
  const globalSettings = useSettingsStore((s) => s.settings);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const needsReprocessRef = useRef(false);
  const retryCountRef = useRef<Map<string, number>>(new Map());
  const MAX_RETRIES = 2;

  // Extract processing logic so it can be re-triggered after completion
  const processAllPending = useCallback(async () => {
    const currentPending = useFileStore.getState().files.filter((f) => {
      if (f.status === 'pending') return true;
      if (isPermanentImageError(f.error)) return false;
      if (f.status === 'error') {
        const count = retryCountRef.current.get(f.id) ?? 0;
        if (count < MAX_RETRIES) {
          retryCountRef.current.set(f.id, count + 1);
          return true;
        }
        return false;
      }
      return false;
    });

    if (currentPending.length === 0) return;

    await runWithConcurrency(
      currentPending,
      getMainPipelineConcurrency(),
      async (file) => {
        const current = useFileStore.getState().files.find((f) => f.id === file.id);
        if (!current || (current.status !== 'pending' && current.status !== 'error')) return;

        const settings = getEffectiveSettings(current, useSettingsStore.getState().settings);
        const settingsHash = getSettingsHash(settings);

        try {
          const dimensions = await readImageDimensions(current.file);
          const dimensionError = validateImageDimensions(dimensions, getImageSafetyLimits());
          if (dimensionError) {
            retryCountRef.current.set(current.id, MAX_RETRIES);
            updateFile(current.id, {
              status: 'error',
              progress: 0,
              error: dimensionError,
            });
            return;
          }

          const stillCurrent = useFileStore.getState().getFile(current.id);
          if (!stillCurrent || (stillCurrent.status !== 'pending' && stillCurrent.status !== 'error')) {
            return;
          }

          const buffer = await current.file.arrayBuffer();
          await processFile(current.id, buffer, settings, settingsHash, updateFile);
          const processed = useFileStore.getState().getFile(current.id);
          if (processed?.status === 'done') retryCountRef.current.delete(current.id);
        } catch (err) {
          updateFile(current.id, {
            status: 'error',
            progress: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
  }, [updateFile]);

  // Watch for changes and auto-compress with debounce
  useEffect(() => {
    const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    // If currently processing, mark that we need to reprocess after completion
    if (processingRef.current) {
      needsReprocessRef.current = true;
      return;
    }

    // Debounce: wait 300ms after last change
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      processingRef.current = true;
      needsReprocessRef.current = false;

      await processAllPending();

      processingRef.current = false;

      // If settings changed during processing, trigger reprocess
      if (needsReprocessRef.current) {
        needsReprocessRef.current = false;
        processingRef.current = true;
        await processAllPending();
        processingRef.current = false;
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [files, globalSettings, processAllPending]);

  // Abort all processing
  const abortAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    processingRef.current = false;
    needsReprocessRef.current = false;
    getPool().abortAll();
    // Reset processing files back to pending
    const { files: storeFiles, updateFile: storeUpdateFile } = useFileStore.getState();
    for (const f of storeFiles) {
      if (f.status === 'processing') {
        storeUpdateFile(f.id, { status: 'pending' });
      }
    }
  };

  return { abortAll };
}
