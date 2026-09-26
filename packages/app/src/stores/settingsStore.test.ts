import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';

// Mock browser APIs
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter += 1;
    return `test-uuid-${uuidCounter}`;
  }),
});

const { useSettingsStore } = await import('./settingsStore');
const { useFileStore } = await import('./fileStore');
const { PRESETS } = await import('./presets');
const { applyPresetSettings } = await import('../utils/settingsUtils');
const { buildEncoderOptions } = await import('@pic-forge/worker');
const { animationArguments } = await import('../animation/engine');

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

  describe('advanced options per format', () => {
    const preset = (id: string) => PRESETS.find((item) => item.id === id)!.settings;
    const gif = { format: 'gif', width: 100, height: 100, ends: [100, 200], plays: 0 } as never;

    it('does not carry WebP lossless into AVIF', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ outputFormat: 'webp' });
      store.updateSettings({ advanced: { lossless: 1 } });
      store.updateSettings({ outputFormat: 'avif', quality: 40 });

      const settings = useSettingsStore.getState().settings;
      expect(settings.advanced).toEqual({});
      const options = buildEncoderOptions(settings);
      expect(options).not.toHaveProperty('lossless');
      expect(options.quality).toBe(40);
    });

    it('keeps only the active format keys through setOutputFormat', () => {
      useSettingsStore.getState().updateSettings({ advanced: { progressive: false } });
      useSettingsStore.getState().setOutputFormat('webp');
      expect(useSettingsStore.getState().settings.advanced).toEqual({});
    });

    it('replaces advanced options when presets are applied, then accepts GIF → WebP', () => {
      const store = useSettingsStore.getState();
      store.replaceSettings(applyPresetSettings(store.settings, preset('web-photo')));
      store.replaceSettings(
        applyPresetSettings(useSettingsStore.getState().settings, preset('high-compress')),
      );
      expect(useSettingsStore.getState().settings.advanced).toEqual({ speed: 6, subsample: 1 });

      useSettingsStore.getState().setOutputFormat('webp');
      const settings = useSettingsStore.getState().settings;
      expect(settings.advanced).toEqual({});
      expect(() => animationArguments(gif, settings)).not.toThrow();
    });

    it('keeps the current resize when a preset is applied', () => {
      useSettingsStore.getState().updateSettings({
        resize: { enabled: true, maxWidth: 800 },
      } as unknown as Partial<CompressSettings>);
      const next = applyPresetSettings(useSettingsStore.getState().settings, preset('balanced'));
      expect(next.outputFormat).toBe('webp');
      expect(next.quality).toBe(75);
      expect(next.resize).toMatchObject({ enabled: true, maxWidth: 800 });
    });

    it('ignores foreign keys in buildEncoderOptions for old snapshots', () => {
      const options = buildEncoderOptions({
        outputFormat: 'avif',
        quality: 50,
        advanced: { lossless: 1, speed: 4 } as never,
      });
      expect(options).not.toHaveProperty('lossless');
      expect(options.speed).toBe(4);
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
