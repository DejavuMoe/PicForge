/**
 * useAutoCompress — watches for settings changes and file additions,
 * automatically triggers compression with debounce.
 *
 * Global files follow the global settings; custom files own full settings snapshots.
 * Main-thread decode/resize is intentionally bounded to avoid memory spikes.
 */

import { useEffect, useRef } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { createAutoCompressController } from './autoCompressController';
import { getPool } from './processingPool';

export { getPool };

export function useAutoCompress() {
  const files = useFileStore((s) => s.files);
  const globalSettings = useSettingsStore((s) => s.settings);
  const controllerRef = useRef<ReturnType<typeof createAutoCompressController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createAutoCompressController();
  }

  useEffect(() => {
    controllerRef.current?.schedule();
    return () => {
      controllerRef.current?.clearDebounce();
    };
  }, [files, globalSettings]);

  return {
    abortAll: () => {
      controllerRef.current?.abortAll();
    },
  };
}
