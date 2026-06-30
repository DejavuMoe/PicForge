import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';

// Mock browser APIs
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn(),
});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter += 1;
    return `test-uuid-${uuidCounter}`;
  }),
});

const { useSettingsStore } = await import('./settingsStore');
const { useFileStore } = await import('./fileStore');

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset settings to defaults
    useSettingsStore.setState({
      settings: {
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
      },
    });
    useFileStore.setState({ files: [] });
    uuidCounter = 0;
    vi.clearAllMocks();
  });

  describe('setOutputFormat', () => {
    it('updates output format', () => {
      useSettingsStore.getState().setOutputFormat('webp');
      expect(useSettingsStore.getState().settings.outputFormat).toBe('webp');
    });

    it('triggers recompression', () => {
      // Add a file and mark it as done
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      useFileStore.getState().addFiles([file]);
      const id = useFileStore.getState().files[0].id;
      useFileStore.getState().updateFile(id, { status: 'done' });

      useSettingsStore.getState().setOutputFormat('webp');

      // File should be reset to pending
      expect(useFileStore.getState().files[0].status).toBe('pending');
    });

    it('does not recompress custom files', () => {
      const files = [
        new File([''], 'custom.jpg', { type: 'image/jpeg' }),
        new File([''], 'global.jpg', { type: 'image/jpeg' }),
      ];
      useFileStore.getState().addFiles(files);
      const [customId, globalId] = useFileStore.getState().files.map((file) => file.id);
      const settings = useSettingsStore.getState().settings;

      useFileStore.getState().setFileCustomSettings(customId, settings);
      useFileStore.getState().updateFile(customId, { status: 'done' });
      useFileStore.getState().updateFile(globalId, { status: 'done' });

      useSettingsStore.getState().setOutputFormat('webp');

      const [customFile, globalFile] = useFileStore.getState().files;
      expect(customFile.settingsMode).toBe('custom');
      expect(customFile.status).toBe('done');
      expect(globalFile.status).toBe('pending');
    });
  });

  describe('setQuality', () => {
    it('updates quality', () => {
      useSettingsStore.getState().setQuality(50);
      expect(useSettingsStore.getState().settings.quality).toBe(50);
    });

    it('clamps quality to 0-100', () => {
      useSettingsStore.getState().setQuality(150);
      expect(useSettingsStore.getState().settings.quality).toBe(100);

      useSettingsStore.getState().setQuality(-10);
      expect(useSettingsStore.getState().settings.quality).toBe(0);
    });
  });

  describe('updateSettings', () => {
    it('merges partial settings', () => {
      useSettingsStore.getState().updateSettings({ quality: 90 });
      const settings = useSettingsStore.getState().settings;
      expect(settings.quality).toBe(90);
      expect(settings.outputFormat).toBe('mozjpeg'); // unchanged
    });

    it('deep merges resize settings', () => {
      useSettingsStore.getState().updateSettings({
        resize: { enabled: true, maxWidth: 800 },
      } as unknown as Partial<CompressSettings>);
      const resize = useSettingsStore.getState().settings.resize!;
      expect(resize.enabled).toBe(true);
      expect(resize.maxWidth).toBe(800);
      expect(resize.maxHeight).toBe(1080); // preserved from defaults
      expect(resize.method).toBe('contain'); // preserved from defaults
    });
  });

  describe('resetToDefaults', () => {
    it('resets all settings to defaults', () => {
      useSettingsStore.getState().setOutputFormat('webp');
      useSettingsStore.getState().setQuality(30);

      useSettingsStore.getState().resetToDefaults();

      const settings = useSettingsStore.getState().settings;
      expect(settings.outputFormat).toBe('mozjpeg');
      expect(settings.quality).toBe(75);
    });
  });
});
