/**
 * Zustand store for managing the image file queue.
 */

import { create } from 'zustand';
import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';
import { generateId, createPreviewUrl, revokePreviewUrl, isSupportedImage } from '../utils/fileUtils';
import { cloneSettings, getSettingsHash, mergeSettings } from '../utils/settingsUtils';

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

  /** Reset global-mode done/processing files to pending after global settings changes */
  resetGlobalToPending: () => void;

  /** Reset all done/processing files to pending */
  resetAllToPending: () => void;
}

function clearResult(file: ImageFile): ImageFile {
  if (file.result?.previewUrl) {
    revokePreviewUrl(file.result.previewUrl);
  }
  return { ...file, result: undefined, outputMeta: undefined };
}

function markForReprocess(file: ImageFile, nextSettingsHash?: string): ImageFile {
  const keepCurrentResult = !!nextSettingsHash
    && file.lastProcessedSettingsHash === nextSettingsHash
    && !!file.result;

  if (keepCurrentResult) {
    return { ...file, error: undefined };
  }

  return {
    ...clearResult(file),
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
        previewUrl: createPreviewUrl(file),
      });
    }

    if (newFiles.length > 0) {
      set((state) => ({ files: [...state.files, ...newFiles] }));
    }
  },

  removeFile: (id) => {
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
    const { files } = get();
    for (const file of files) {
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
          revokePreviewUrl(f.result.previewUrl);
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

  resetGlobalToPending: () => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.settingsMode === 'global' && (f.status === 'done' || f.status === 'processing')) {
          return markForReprocess(f);
        }
        return f;
      }),
    }));
  },

  resetAllToPending: () => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.status === 'done' || f.status === 'processing') {
          return markForReprocess(f);
        }
        return f;
      }),
    }));
  },
}));
