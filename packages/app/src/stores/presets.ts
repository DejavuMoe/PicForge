/**
 * Compression presets for common use cases.
 *
 * Presets control format, quality and that format's advanced options — NOT
 * resize. Applying one replaces the advanced options (see applyPresetSettings)
 * and keeps the current resize, which is a separate manual control.
 *
 * Labels and descriptions are i18n keys — use t() to render.
 */

import type { CompressSettings } from '@pic-forge/codecs';

export interface Preset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  settings: Pick<CompressSettings, 'outputFormat' | 'quality' | 'advanced'>;
}

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    labelKey: 'presets.balanced.label',
    descriptionKey: 'presets.balanced.description',
    settings: {
      outputFormat: 'webp',
      quality: 75,
      advanced: { method: 4, alpha_compression: 1 },
    },
  },
  {
    id: 'web-photo',
    labelKey: 'presets.web-photo.label',
    descriptionKey: 'presets.web-photo.description',
    settings: {
      outputFormat: 'mozjpeg',
      quality: 80,
      advanced: { progressive: true, chroma_subsample: 2 },
    },
  },
  {
    id: 'lossless',
    labelKey: 'presets.lossless.label',
    descriptionKey: 'presets.lossless.description',
    settings: {
      outputFormat: 'oxipng',
      quality: 100,
      advanced: { level: 2, interlace: false },
    },
  },
  {
    id: 'high-compress',
    labelKey: 'presets.high-compress.label',
    descriptionKey: 'presets.high-compress.description',
    settings: {
      outputFormat: 'avif',
      quality: 50,
      advanced: { speed: 6, subsample: 1 },
    },
  },
];
