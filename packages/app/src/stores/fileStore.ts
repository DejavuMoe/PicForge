/**
 * Zustand store for managing the image file queue.
 */

import { create } from 'zustand';
import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';
import { generateId, createPreviewUrl, revokePreviewUrl, isSupportedImage } from '../utils/fileUtils';
import { cloneSettings, getSettingsHash, mergeSettings } from '../utils/settingsUtils';
import { abortAllProcessing, abortFileProcessing } from '../hooks/processingPool';

interface FileStore {
  /** All image files in the queue */
  files: ImageFile[];

  /** Add files to the queue */
  addFiles: (fileList: FileList | File[]) => void;

  /** Remove a single file from the queue */
  removeFile: (id: string) => void;

  /** Clear all files from the queue */
  clearAll: () => void;

  /** Update a file's status, progress, or result */
  updateFile: (id: string, update: Partial<ImageFile>) => void;

  /** Create or replace a full custom settings snapshot for one file */
  setFileCustomSettings: (id: string, settings: CompressSettings) => void;

  /** Update the custom settings snapshot for one file */
  updateFileCustomSettings: (id: string, partial: Partial<CompressSettings>) => void;

  /** Restore one file to follow global settings */
  resetFileToGlobal: (id: string, globalSettings: CompressSettings) => void;

  /** Get file by id */
  getFile: (id: string) => ImageFile | undefined;

  /** Invalidate in-flight global-mode work after global settings changes */
  resetGlobalToPending: (nextSettingsHash?: string) => void;

  /** Reset all done/processing/pending files to pending */
  resetAllToPending: () => void;

  /** User cancel: stop auto-scheduling until explicit retry */
  cancelFile: (id: string) => void;

  /** Explicit retry for error or cancelled files */
  retryFile: (id: string) => void;

  /** Cancel pending, processing, and auto-retryable error files in the current batch */
  cancelIncompleteFiles: () => void;
}

function bumpEpoch(file: ImageFile): number {
  return (file.taskEpoch ?? 0) + 1;
}

function isInFlightStatus(status: ImageFile['status']): boolean {
  return status === 'pending' || status === 'processing' || status === 'done';
}

function markForReprocess(file: ImageFile, nextSettingsHash?: string): ImageFile {
  const taskEpoch = bumpEpoch(file);
  const keepCurrentResult = !!nextSettingsHash
    && file.lastProcessedSettingsHash === nextSettingsHash
    && !!file.result;

  if (file.status === 'cancelled') {
    return {
      ...file,
      taskEpoch,
      progress: 0,
      error: undefined,
    };
  }

  if (keepCurrentResult) {
    return {
      ...file,
      taskEpoch,
      status: 'done',
      progress: 100,
      error: undefined,
    };
  }

  return {
    ...file,
    taskEpoch,
    status: 'pending',
    progress: 0,
    error: undefined,
  };
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],

  addFiles: (fileList) => {
    const newFiles: ImageFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!isSupportedImage(file)) continue;

      newFiles.push({
        id: generateId(),
        file,
        originalSize: file.size,
        status: 'pending',
        settingsMode: 'global',
        progress: 0,
        taskEpoch: 0,
        previewUrl: createPreviewUrl(file),
      });
    }

    if (newFiles.length > 0) {
      set((state) => ({ files: [...state.files, ...newFiles] }));
    }
  },

  removeFile: (id) => {
    abortFileProcessing(id);
    set((state) => {
      const file = state.files.find((f) => f.id === id);
      if (file) {
        revokePreviewUrl(file.previewUrl);
        if (file.result?.previewUrl) {
          revokePreviewUrl(file.result.previewUrl);
        }
      }
      return { files: state.files.filter((f) => f.id !== id) };
    });
  },

  clearAll: () => {
    abortAllProcessing();
    const { files } = get();
    for (const file of files) {
      abortFileProcessing(file.id);
      revokePreviewUrl(file.previewUrl);
      if (file.result?.previewUrl) {
        revokePreviewUrl(file.result.previewUrl);
      }
    }
    set({ files: [] });
  },

  updateFile: (id, update) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        // Revoke old result URL whenever it is replaced or explicitly cleared.
        if (Object.prototype.hasOwnProperty.call(update, 'result') && f.result?.previewUrl) {
          if (update.result?.previewUrl !== f.result.previewUrl) {
            revokePreviewUrl(f.result.previewUrl);
          }
        }
        return { ...f, ...update };
      }),
    }));
  },

  setFileCustomSettings: (id, settings) => {
    const customSettings = cloneSettings(settings);
    const settingsHash = getSettingsHash(customSettings);
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        return {
          ...markForReprocess(f, settingsHash),
          settingsMode: 'custom',
          customSettings,
        };
      }),
    }));
  },

  updateFileCustomSettings: (id, partial) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id || f.settingsMode !== 'custom' || !f.customSettings) return f;
        const customSettings = mergeSettings(f.customSettings, partial);
        const settingsHash = getSettingsHash(customSettings);
        return {
          ...markForReprocess(f, settingsHash),
          settingsMode: 'custom',
          customSettings,
        };
      }),
    }));
  },

  resetFileToGlobal: (id, globalSettings) => {
    const settingsHash = getSettingsHash(globalSettings);
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        const nextFile = markForReprocess(f, settingsHash);
        return {
          ...nextFile,
          settingsMode: 'global',
          customSettings: undefined,
        };
      }),
    }));
  },

  getFile: (id) => {
    return get().files.find((f) => f.id === id);
  },

  resetGlobalToPending: (nextSettingsHash) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.settingsMode !== 'global') return f;
        if (f.status === 'cancelled' || f.status === 'error') return f;
        if (!isInFlightStatus(f.status)) return f;
        return markForReprocess(f, nextSettingsHash);
      }),
    }));
  },

  resetAllToPending: () => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.status === 'cancelled' || f.status === 'error') return f;
        if (!isInFlightStatus(f.status)) return f;
        return markForReprocess(f);
      }),
    }));
  },

  cancelFile: (id) => {
    abortFileProcessing(id);
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        if (f.status === 'done' || f.status === 'error' || f.status === 'cancelled') return f;
        return {
          ...f,
          status: 'cancelled',
          progress: 0,
          error: undefined,
          taskEpoch: bumpEpoch(f),
        };
      }),
    }));
  },

  retryFile: (id) => {
    abortFileProcessing(id);
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        if (f.status !== 'error' && f.status !== 'cancelled') return f;
        return {
          ...f,
          status: 'pending',
          progress: 0,
          error: undefined,
          taskEpoch: bumpEpoch(f),
        };
      }),
    }));
  },

  cancelIncompleteFiles: () => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.status === 'done' || f.status === 'cancelled') return f;
        abortFileProcessing(f.id);
        return {
          ...f,
          status: 'cancelled' as const,
          progress: 0,
          error: undefined,
          taskEpoch: bumpEpoch(f),
        };
      }),
    }));
  },
}));
