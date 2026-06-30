import { describe, expect, it } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';
import {
  createExportManifest,
  createZipName,
  getOutputName,
  makeUniqueName,
} from './exportManifest';

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
  settings?: Partial<ImageFile>,
): ImageFile {
  return {
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
});
