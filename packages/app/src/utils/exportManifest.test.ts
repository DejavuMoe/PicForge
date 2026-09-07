import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';
import {
  createExportManifest,
  createZipName,
  getOutputName,
  isResultExportable,
  makeUniqueName,
} from './exportManifest';
import { getSettingsHash } from './settingsUtils';

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

function createImageFile(
  id: string,
  name: string,
  settings: Partial<ImageFile> = {},
): ImageFile {
  const file: ImageFile = {
    id,
    file: new File([new ArrayBuffer(1000)], name, { type: 'image/png' }),
    originalSize: 1000,
    status: 'done',
    settingsMode: 'global',
    progress: 100,
    previewUrl: `blob:${id}:original`,
    result: {
      blob: new Blob([new ArrayBuffer(320)], { type: 'image/jpeg' }),
      size: 320,
      previewUrl: `blob:${id}:result`,
    },
    outputMeta: {
      originalWidth: 1200,
      originalHeight: 800,
      outputWidth: 600,
      outputHeight: 400,
      settingsHash: 'legacy',
    },
    ...settings,
  };
  if (!Object.prototype.hasOwnProperty.call(settings, 'lastProcessedSettingsHash')) {
    const effective = file.settingsMode === 'custom' && file.customSettings
      ? file.customSettings
      : baseSettings;
    file.lastProcessedSettingsHash = getSettingsHash(effective);
  }
  return file;
}

describe('exportManifest', () => {
  it('creates stable unique names for repeated filenames', () => {
    const used = new Set<string>();

    expect(makeUniqueName('photo.jpg', used)).toBe('photo.jpg');
    expect(makeUniqueName('photo.jpg', used)).toBe('photo-2.jpg');
    expect(makeUniqueName('photo.jpg', used)).toBe('photo-3.jpg');
  });

  it('derives output names from effective global or custom settings', () => {
    const file = createImageFile('a', 'sample.png');
    const customFile = createImageFile('b', 'sample.png', {
      settingsMode: 'custom',
      customSettings: { ...baseSettings, outputFormat: 'webp' },
    });

    expect(getOutputName(file, baseSettings)).toBe('sample.jpg');
    expect(getOutputName(customFile, baseSettings)).toBe('sample.webp');
  });

  it('records version, totals, dimensions, settings hash, and source id', () => {
    const date = new Date('2026-06-24T08:00:00.000Z');
    const files = [
      createImageFile('a', 'same.png'),
      createImageFile('b', 'same.png', {
        settingsMode: 'custom',
        customSettings: {
          ...baseSettings,
          outputFormat: 'webp',
          quality: 60,
          resize: { ...baseSettings.resize!, enabled: true, maxWidth: 600, maxHeight: 400 },
        },
      }),
    ];

    const manifest = createExportManifest(files, baseSettings, '9.9.9', date);

    expect(manifest.app).toBe('PicForge');
    expect(manifest.version).toBe('9.9.9');
    expect(manifest.generatedAt).toBe('2026-06-24T08:00:00.000Z');
    expect(manifest.totals).toEqual({
      fileCount: 2,
      originalSize: 2000,
      outputSize: 640,
      savedBytes: 1360,
    });
    expect(manifest.files.map((file) => file.outputName)).toEqual(['same.jpg', 'same.webp']);
    expect(manifest.files[0]).toMatchObject({
      sourceId: 'a',
      originalName: 'same.png',
      settingsMode: 'global',
      originalDimensions: '1200x800',
      outputDimensions: '600x400',
      compressionRatio: 68,
    });
    expect(manifest.files[0].settingsHash).toMatch(/^s/);
    expect(manifest.files[1]).toMatchObject({
      sourceId: 'b',
      settingsMode: 'custom',
      outputFormat: 'webp',
      quality: 60,
    });
  });

  it('creates filesystem-friendly ZIP names', () => {
    expect(createZipName(new Date('2026-06-24T08:00:00.123Z'))).toBe(
      'picforge-2026-06-24T08-00-00-123Z.zip',
    );
  });

  it('sanitizes traversal, backslash paths, drive letters, and control characters', () => {
    expect(getOutputName(createImageFile('a', '../escaped.png'), baseSettings)).toBe('escaped.jpg');
    expect(getOutputName(createImageFile('b', '..\\..\\escaped.png'), baseSettings)).toBe('escaped.jpg');
    expect(getOutputName(createImageFile('c', 'C:\\temp\\photo.png'), baseSettings)).toBe('photo.jpg');
    expect(getOutputName(createImageFile('d', 'C:foo.png'), baseSettings)).toBe('C_foo.jpg');
    expect(getOutputName(createImageFile('e', 'bad\u0000name.png'), baseSettings)).toBe('bad_name.jpg');
    expect(getOutputName(createImageFile('f', '.'), baseSettings)).toBe('_.jpg');
    expect(getOutputName(createImageFile('g', ''), baseSettings)).toBe('image.jpg');
  });

  it('unique-names collisions that only appear after sanitizing, including natural numeric suffixes', () => {
    const files = [
      createImageFile('a', '../photo.png'),
      createImageFile('b', 'photo.png'),
      createImageFile('c', 'photo-2.png'),
      createImageFile('d', 'nested\\photo.png'),
    ];
    const manifest = createExportManifest(files, baseSettings, '9.9.9');
    expect(manifest.files.map((file) => file.outputName)).toEqual([
      'photo.jpg',
      'photo-2.jpg',
      'photo-2-2.jpg',
      'photo-3.jpg',
    ]);
    expect(manifest.files.map((file) => file.originalName)).toEqual([
      '../photo.png',
      'photo.png',
      'photo-2.png',
      'nested\\photo.png',
    ]);
  });

  it('keeps original names in the manifest while ZIP entries use sanitized unique names', async () => {
    const files = [
      createImageFile('a', '..\\..\\escaped.png', {
        result: {
          blob: new Uint8Array([111, 110, 101]) as unknown as Blob,
          size: 3,
          previewUrl: 'blob:a:result',
        },
      }),
      createImageFile('b', 'escaped.png', {
        result: {
          blob: new Uint8Array([116, 119, 111]) as unknown as Blob,
          size: 3,
          previewUrl: 'blob:b:result',
        },
      }),
    ];
    const manifest = createExportManifest(files, baseSettings, '9.9.9');
    const zip = new JSZip();
    for (const entry of manifest.files) {
      const file = files.find((item) => item.id === entry.sourceId);
      zip.file(entry.outputName, file!.result!.blob);
    }
    zip.file('picforge-manifest.json', JSON.stringify(manifest));
    const packed = await zip.generateAsync({ type: 'uint8array' });
    const loaded = await JSZip.loadAsync(packed);
    const entryNames = Object.keys(loaded.files).filter((name) => !loaded.files[name].dir);

    expect(entryNames).toEqual(['escaped.jpg', 'escaped-2.jpg', 'picforge-manifest.json']);
    expect(entryNames.some((name) => name.includes('..') || name.includes('\\'))).toBe(false);
    expect(await loaded.file('escaped.jpg')!.async('string')).toBe('one');
    expect(await loaded.file('escaped-2.jpg')!.async('string')).toBe('two');
    expect(manifest.files[0].originalName).toBe('..\\..\\escaped.png');
    expect(manifest.files[0].outputName).toBe('escaped.jpg');
  });

  it('does not export a stale result after settings change', () => {
    const currentHash = getSettingsHash(baseSettings);
    const stale = createImageFile('a', 'sample.png', {
      status: 'pending',
      lastProcessedSettingsHash: currentHash,
    });
    const mismatched = createImageFile('b', 'sample.png', {
      status: 'done',
      lastProcessedSettingsHash: 's-other',
    });
    const current = createImageFile('c', 'sample.png', {
      status: 'done',
      lastProcessedSettingsHash: currentHash,
    });

    expect(isResultExportable(stale, baseSettings)).toBe(false);
    expect(isResultExportable(mismatched, baseSettings)).toBe(false);
    expect(isResultExportable(current, baseSettings)).toBe(true);
    expect(createExportManifest([stale, mismatched, current], baseSettings, '9.9.9').files).toHaveLength(1);
    expect(createExportManifest([stale, mismatched, current], baseSettings, '9.9.9').files[0].sourceId).toBe('c');
  });

  it('rejects missing hashes and non-done statuses instead of treating them as exportable', () => {
    const currentHash = getSettingsHash(baseSettings);
    const missingHash = createImageFile('missing', 'sample.png', {
      lastProcessedSettingsHash: undefined,
    });
    const processing = createImageFile('proc', 'sample.png', {
      status: 'processing',
      lastProcessedSettingsHash: currentHash,
    });
    const errored = createImageFile('err', 'sample.png', {
      status: 'error',
      lastProcessedSettingsHash: currentHash,
    });
    const cancelled = createImageFile('can', 'sample.png', {
      status: 'cancelled',
      lastProcessedSettingsHash: currentHash,
    });

    expect(isResultExportable(missingHash, baseSettings)).toBe(false);
    expect(isResultExportable(processing, baseSettings)).toBe(false);
    expect(isResultExportable(errored, baseSettings)).toBe(false);
    expect(isResultExportable(cancelled, baseSettings)).toBe(false);
    expect(createExportManifest(
      [missingHash, processing, errored, cancelled],
      baseSettings,
      '9.9.9',
    ).files).toHaveLength(0);
  });
});
