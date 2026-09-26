/**
 * useAutoCompress — watches for settings changes and file additions,
 * automatically triggers compression with debounce.
 *
 * Global files follow the global settings; custom files own full settings snapshots.
 * Concurrency is bounded by the encoder pool and the shared memory budget; the
 * selected file is processed first.
 */

import { useEffect, useRef } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { createAutoCompressController } from './autoCompressController';
import { getPool } from './processingPool';

export { getPool };

export function useAutoCompress(selectedId: string | null = null) {
  const files = useFileStore((s) => s.files);
  const globalSettings = useSettingsStore((s) => s.settings);
  const controllerRef = useRef<ReturnType<typeof createAutoCompressController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createAutoCompressController();
  }

  useEffect(() => {
    controllerRef.current?.setPriority(selectedId);
  }, [selectedId]);

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
