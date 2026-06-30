/**
 * Zustand store for managing compression settings.
 *
 * When global settings change, all done/processing files are reset to 'pending'
 * so the useAutoCompress hook will re-process them with the new settings.
 */

import { create } from 'zustand';
import type { CompressSettings, OutputFormat } from '@pic-forge/codecs';
import { useFileStore } from './fileStore';
import { cloneSettings, mergeSettings } from '../utils/settingsUtils';

interface SettingsStore {
  settings: CompressSettings;
  updateSettings: (partial: Partial<CompressSettings>) => void;
  setOutputFormat: (format: OutputFormat) => void;
  setQuality: (quality: number) => void;
  resetToDefaults: () => void;
}

const defaultSettings: CompressSettings = {
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

/** Reset all files to pending so they get re-compressed with new settings */
function triggerRecompression() {
  useFileStore.getState().resetGlobalToPending();
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: cloneSettings(defaultSettings),

  updateSettings: (partial) => {
    set((state) => {
      return { settings: mergeSettings(state.settings, partial) };
    });
    triggerRecompression();
  },

  setOutputFormat: (format) => {
    set((state) => ({
      settings: { ...state.settings, outputFormat: format },
    }));
    triggerRecompression();
  },

  setQuality: (quality) => {
    set((state) => ({
      settings: { ...state.settings, quality: Math.max(0, Math.min(100, quality)) },
    }));
    triggerRecompression();
  },

  resetToDefaults: () => {
    set({ settings: cloneSettings(defaultSettings) });
    triggerRecompression();
  },
}));
