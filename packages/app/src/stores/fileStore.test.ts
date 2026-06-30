import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';

// Mock browser APIs not available in Node
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn(),
});

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

    it('revokes completed result URLs when resetting done files', () => {
      useFileStore.getState().addFiles([createMockFile('a.jpg', 'image/jpeg')]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, {
        status: 'done',
        result: {
          blob: new Blob([new ArrayBuffer(4)]),
          size: 4,
          previewUrl: 'blob:reset-result',
        },
      });

      useFileStore.getState().resetAllToPending();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:reset-result');
      expect(useFileStore.getState().files[0].result).toBeUndefined();
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
  });
});
