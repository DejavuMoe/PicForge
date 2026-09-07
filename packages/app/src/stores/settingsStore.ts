/**
 * Zustand store for managing compression settings.
 *
 * When global settings change, in-flight global-mode work is invalidated.
 * A matching previous result is restored instead of re-encoding.
 */

import { create } from 'zustand';
import type { CompressSettings, OutputFormat } from '@pic-forge/codecs';
import { useFileStore } from './fileStore';
import { cloneSettings, getSettingsHash, mergeSettings } from '../utils/settingsUtils';

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

/** Invalidate in-flight global work and restore a matching previous result when possible */
function triggerRecompression() {
  const settings = useSettingsStore.getState().settings;
  useFileStore.getState().resetGlobalToPending(getSettingsHash(settings));
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
