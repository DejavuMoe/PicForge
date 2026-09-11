import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import { getSettingsHash } from '../utils/settingsUtils';

// Mock browser APIs not available in Node
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter += 1;
    return uuidCounter === 1 ? 'test-uuid-1234' : `test-uuid-${uuidCounter}`;
  }),
});

// Mock File.type getter
const createMockFile = (name: string, type: string, size = 1024): File => {
  const file = new File([new ArrayBuffer(size)], name, { type });
  return file;
};

// Import after mocks are set up
const { useFileStore } = await import('./fileStore');
const { useSettingsStore } = await import('./settingsStore');
const { isResultExportable } = await import('../utils/exportManifest');

const baseSettings: CompressSettings = {
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

describe('fileStore', () => {
  beforeEach(() => {
    // Reset store to empty state
    useFileStore.setState({ files: [] });
    useSettingsStore.setState({
      settings: { ...baseSettings, resize: { ...baseSettings.resize! } },
    });
    uuidCounter = 0;
    vi.clearAllMocks();
  });

  describe('addFiles', () => {
    it('adds supported image files', () => {
      const file = createMockFile('photo.jpg', 'image/jpeg');
      useFileStore.getState().addFiles([file]);

      const files = useFileStore.getState().files;
      expect(files).toHaveLength(1);
      expect(files[0].file.name).toBe('photo.jpg');
      expect(files[0].status).toBe('pending');
      expect(files[0].settingsMode).toBe('global');
      expect(files[0].id).toBe('test-uuid-1234');
    });

    it('rejects unsupported file types', () => {
      const file = createMockFile('doc.pdf', 'application/pdf');
      useFileStore.getState().addFiles([file]);

      expect(useFileStore.getState().files).toHaveLength(0);
    });

    it('adds multiple files', () => {
      const files = [
        createMockFile('a.jpg', 'image/jpeg'),
        createMockFile('b.png', 'image/png'),
      ];
      useFileStore.getState().addFiles(files);

      expect(useFileStore.getState().files).toHaveLength(2);
    });

    it('handles a large batch without dropping supported images', () => {
      const files = Array.from({ length: 150 }, (_, index) =>
        createMockFile(`batch-${index}.jpg`, 'image/jpeg'),
      );

      useFileStore.getState().addFiles(files);

      expect(useFileStore.getState().files).toHaveLength(150);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(150);
    });
  });

  describe('removeFile', () => {
    it('removes a file by id', () => {
      const file = createMockFile('photo.jpg', 'image/jpeg');
      useFileStore.getState().addFiles([file]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().removeFile(id);
      expect(useFileStore.getState().files).toHaveLength(0);
    });

    it('revokes preview URLs on remove', () => {
      const file = createMockFile('photo.jpg', 'image/jpeg');
      useFileStore.getState().addFiles([file]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().removeFile(id);
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('revokes result URLs on remove', () => {
      useFileStore.getState().addFiles([createMockFile('photo.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:result-remove',
        },
      });

      useFileStore.getState().removeFile(id);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result-remove');
    });
  });

  describe('clearAll', () => {
    it('removes all files', () => {
      useFileStore.getState().addFiles([
        createMockFile('a.jpg', 'image/jpeg'),
        createMockFile('b.png', 'image/png'),
      ]);
      expect(useFileStore.getState().files).toHaveLength(2);

      useFileStore.getState().clearAll();
      expect(useFileStore.getState().files).toHaveLength(0);
    });

    it('revokes original and result URLs for every file', () => {
      useFileStore.getState().addFiles([
        createMockFile('a.jpg', 'image/jpeg'),
        createMockFile('b.png', 'image/png'),
      ]);
      const [first, second] = useFileStore.getState().files;
      useFileStore.getState().updateFile(first.id, {
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:first-result',
        },
      });
      useFileStore.getState().updateFile(second.id, {
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:second-result',
        },
      });

      useFileStore.getState().clearAll();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-result');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second-result');
    });

    it('clears a large batch and revokes every original URL', () => {
      const files = Array.from({ length: 150 }, (_, index) =>
        createMockFile(`batch-${index}.jpg`, 'image/jpeg'),
      );
      useFileStore.getState().addFiles(files);

      useFileStore.getState().clearAll();

      expect(useFileStore.getState().files).toHaveLength(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(150);
    });
  });

  describe('updateFile', () => {
    it('updates file status', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().updateFile(id, { status: 'done', progress: 100 });
      const updated = useFileStore.getState().files[0];
      expect(updated.status).toBe('done');
      expect(updated.progress).toBe(100);
    });

    it('revokes the previous result URL when result is replaced', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:first-result',
        },
      });

      useFileStore.getState().updateFile(id, {
        result: {
          blob: new Blob([new ArrayBuffer(5)]),
          size: 5,
          previewUrl: 'blob:second-result',
        },
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-result');
    });

    it('revokes the previous result URL when result is explicitly cleared', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:cleared-result',
        },
      });

      useFileStore.getState().updateFile(id, { result: undefined });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cleared-result');
      expect(useFileStore.getState().files[0].result).toBeUndefined();
    });
  });

  describe('resetAllToPending', () => {
    it('resets done files to pending', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().updateFile(id, { status: 'done' });
      expect(useFileStore.getState().files[0].status).toBe('done');

      useFileStore.getState().resetAllToPending();
      expect(useFileStore.getState().files[0].status).toBe('pending');
    });

    it('keeps the latest successful result while reprocessing', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        status: 'done',
        lastProcessedSettingsHash: 's-old',
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:reset-result',
        },
      });

      vi.clearAllMocks();
      useFileStore.getState().resetAllToPending();

      const file = useFileStore.getState().files[0];
      expect(file.status).toBe('pending');
      expect(file.result?.previewUrl).toBe('blob:reset-result');
      expect(file.lastProcessedSettingsHash).toBe('s-old');
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:reset-result');
    });

    it('does not reset error files', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().updateFile(id, { status: 'error' });
      useFileStore.getState().resetAllToPending();
      expect(useFileStore.getState().files[0].status).toBe('error');
    });
  });

  describe('custom settings', () => {
    it('sets a full custom settings snapshot', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().setFileCustomSettings(id, {
        ...baseSettings,
        outputFormat: 'webp',
        quality: 60,
      });

      const file = useFileStore.getState().files[0];
      expect(file.settingsMode).toBe('custom');
      expect(file.customSettings?.outputFormat).toBe('webp');
      expect(file.customSettings?.quality).toBe(60);
      expect(file.status).toBe('pending');
    });

    it('updates only custom settings snapshots', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().setFileCustomSettings(id, baseSettings);
      useFileStore.getState().updateFileCustomSettings(id, { quality: 45 });

      const file = useFileStore.getState().files[0];
      expect(file.customSettings?.quality).toBe(45);
      expect(file.settingsMode).toBe('custom');
    });

    it('resets only global files after global settings changes', () => {
      useFileStore.getState().addFiles([
        createMockFile('a.jpg', 'image/jpeg'),
        createMockFile('b.jpg', 'image/jpeg'),
      ]);
      const [customId, globalId] = useFileStore.getState().files.map((f) => f.id);

      useFileStore.getState().setFileCustomSettings(customId, baseSettings);
      useFileStore.getState().updateFile(customId, { status: 'done' });
      useFileStore.getState().updateFile(globalId, { status: 'done' });

      useFileStore.getState().resetGlobalToPending();

      const [customFile, globalFile] = useFileStore.getState().files;
      expect(customFile.status).toBe('done');
      expect(globalFile.status).toBe('pending');
    });

    it('restores a custom file to global settings', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;

      useFileStore.getState().setFileCustomSettings(id, baseSettings);
      useFileStore.getState().resetFileToGlobal(id, baseSettings);

      const file = useFileStore.getState().files[0];
      expect(file.settingsMode).toBe('global');
      expect(file.customSettings).toBeUndefined();
      expect(file.status).toBe('pending');
    });

    it('does not let global settings overwrite a custom snapshot while keeping stale preview', () => {
      useFileStore.getState().addFiles([
        createMockFile('custom.jpg', 'image/jpeg'),
        createMockFile('global.jpg', 'image/jpeg'),
      ]);
      const [customId, globalId] = useFileStore.getState().files.map((f) => f.id);
      const customSettings = { ...baseSettings, quality: 40 };
      useFileStore.getState().setFileCustomSettings(customId, customSettings);
      useFileStore.getState().updateFile(customId, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(customSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:custom-result',
        },
      });
      useFileStore.getState().updateFile(globalId, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(baseSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:global-result',
        },
      });

      useFileStore.getState().resetGlobalToPending();

      const [customFile, globalFile] = useFileStore.getState().files;
      expect(customFile.status).toBe('done');
      expect(customFile.customSettings?.quality).toBe(40);
      expect(customFile.result?.previewUrl).toBe('blob:custom-result');
      expect(globalFile.status).toBe('pending');
      expect(globalFile.result?.previewUrl).toBe('blob:global-result');
    });
  });

  it('retries animation settings errors after a corrective global edit, but preserves cancellation', () => {
    useFileStore.getState().addFiles([createMockFile('animation.gif', 'image/gif')]);
    const id = useFileStore.getState().files[0].id;
    useFileStore.getState().updateFile(id, { status: 'error', error: 'Animation: format' });
    useFileStore.getState().resetGlobalToPending('webp-settings');
    expect(useFileStore.getState().files[0]).toMatchObject({ status: 'pending', error: undefined });
    useFileStore.getState().cancelFile(id);
    useFileStore.getState().resetGlobalToPending('new-settings');
    expect(useFileStore.getState().files[0].status).toBe('cancelled');
  });

  describe('cancel and retry', () => {
    it('marks processing files cancelled and keeps them cancelled after settings changes', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        status: 'processing',
        lastProcessedSettingsHash: getSettingsHash(baseSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:cancel-keep',
        },
      });

      useFileStore.getState().cancelFile(id);
      expect(useFileStore.getState().files[0].status).toBe('cancelled');
      expect(useFileStore.getState().files[0].result?.previewUrl).toBe('blob:cancel-keep');

      useFileStore.getState().resetGlobalToPending();
      expect(useFileStore.getState().files[0].status).toBe('cancelled');
    });

    it('requeues only after explicit retry', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, { status: 'processing' });
      useFileStore.getState().cancelFile(id);
      useFileStore.getState().retryFile(id);
      expect(useFileStore.getState().files[0].status).toBe('pending');
    });

    it('restores a matching previous result when settings return to A after A→B→A', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      const hashA = getSettingsHash(baseSettings);
      useFileStore.getState().updateFile(id, {
        status: 'done',
        lastProcessedSettingsHash: hashA,
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:result-a',
        },
      });

      useFileStore.getState().setFileCustomSettings(id, { ...baseSettings, quality: 40 });
      expect(useFileStore.getState().files[0].status).toBe('pending');
      expect(useFileStore.getState().files[0].result?.previewUrl).toBe('blob:result-a');

      useFileStore.getState().resetFileToGlobal(id, baseSettings);
      const restored = useFileStore.getState().files[0];
      expect(restored.status).toBe('done');
      expect(restored.result?.previewUrl).toBe('blob:result-a');
      expect(restored.settingsMode).toBe('global');
    });

    it('cancels pending files that have not started', () => {
      useFileStore.getState().addFiles([
        createMockFile('a.jpg', 'image/jpeg'),
        createMockFile('b.jpg', 'image/jpeg'),
      ]);
      useFileStore.getState().cancelIncompleteFiles();
      expect(useFileStore.getState().files.every((file) => file.status === 'cancelled')).toBe(true);
    });

    it('cancels retryable error files along with pending and processing work', () => {
      useFileStore.getState().addFiles([
        createMockFile('pending.jpg', 'image/jpeg'),
        createMockFile('processing.jpg', 'image/jpeg'),
        createMockFile('error.jpg', 'image/jpeg'),
        createMockFile('done.jpg', 'image/jpeg'),
      ]);
      const [pendingId, processingId, errorId, doneId] = useFileStore.getState().files.map((f) => f.id);
      useFileStore.getState().updateFile(processingId, { status: 'processing' });
      useFileStore.getState().updateFile(errorId, { status: 'error', error: 'transient failure' });
      useFileStore.getState().updateFile(doneId, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(baseSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:done-keep',
        },
      });

      useFileStore.getState().cancelIncompleteFiles();

      const files = useFileStore.getState().files;
      expect(files.find((file) => file.id === pendingId)?.status).toBe('cancelled');
      expect(files.find((file) => file.id === processingId)?.status).toBe('cancelled');
      expect(files.find((file) => file.id === errorId)?.status).toBe('cancelled');
      expect(files.find((file) => file.id === doneId)?.status).toBe('done');
      expect(files.find((file) => file.id === doneId)?.result?.previewUrl).toBe('blob:done-keep');
    });
  });

  describe('global settings A→B→A', () => {
    it('invalidates pending in-flight work when global quality changes', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      const epochBefore = useFileStore.getState().files[0].taskEpoch ?? 0;

      useSettingsStore.getState().setQuality(40);

      const file = useFileStore.getState().getFile(id)!;
      expect(file.status).toBe('pending');
      expect(file.taskEpoch).toBe(epochBefore + 1);
    });

    it('restores a matching previous result through the real global setter', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      const hashA = getSettingsHash(useSettingsStore.getState().settings);
      useFileStore.getState().updateFile(id, {
        status: 'done',
        lastProcessedSettingsHash: hashA,
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:result-a',
        },
      });

      useSettingsStore.getState().setQuality(40);
      expect(useFileStore.getState().files[0].status).toBe('pending');
      expect(useFileStore.getState().files[0].result?.previewUrl).toBe('blob:result-a');
      expect(isResultExportable(useFileStore.getState().files[0], useSettingsStore.getState().settings)).toBe(false);

      useSettingsStore.getState().setQuality(75);
      const restored = useFileStore.getState().files[0];
      expect(restored.status).toBe('done');
      expect(restored.result?.previewUrl).toBe('blob:result-a');
      expect(restored.taskEpoch).toBeGreaterThan(0);
      expect(isResultExportable(restored, useSettingsStore.getState().settings)).toBe(true);
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:result-a');
    });

    it('keeps cancelled files cancelled when global settings return to A', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(useSettingsStore.getState().settings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:cancelled-a',
        },
      });
      useFileStore.getState().updateFile(id, { status: 'cancelled' });

      useSettingsStore.getState().setQuality(40);
      useSettingsStore.getState().setQuality(75);

      expect(useFileStore.getState().files[0].status).toBe('cancelled');
      expect(isResultExportable(useFileStore.getState().files[0], useSettingsStore.getState().settings)).toBe(false);
    });

    it('does not restore or reprocess custom snapshots when global quality returns to A', () => {
      useFileStore.getState().addFiles([
        createMockFile('custom.jpg', 'image/jpeg'),
        createMockFile('global.jpg', 'image/jpeg'),
      ]);
      const [customId, globalId] = useFileStore.getState().files.map((f) => f.id);
      const customSettings = { ...baseSettings, quality: 40 };
      useFileStore.getState().setFileCustomSettings(customId, customSettings);
      useFileStore.getState().updateFile(customId, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(customSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:custom-a',
        },
      });
      useFileStore.getState().updateFile(globalId, {
        status: 'done',
        lastProcessedSettingsHash: getSettingsHash(baseSettings),
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:global-a',
        },
      });

      useSettingsStore.getState().setQuality(40);
      useSettingsStore.getState().setQuality(75);

      const [customFile, globalFile] = useFileStore.getState().files;
      expect(customFile.status).toBe('done');
      expect(customFile.customSettings?.quality).toBe(40);
      expect(customFile.result?.previewUrl).toBe('blob:custom-a');
      expect(globalFile.status).toBe('done');
      expect(globalFile.result?.previewUrl).toBe('blob:global-a');
    });
  });
});
