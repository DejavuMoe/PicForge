/**
 * Compression presets for common use cases.
 *
 * Presets only control format + quality — NOT resize.
 * This ensures the comparison slider always shows same-dimension images,
 * and keeps presets simple and predictable.
 * Resize is a separate manual control users can toggle independently.
 *
 * Labels and descriptions are i18n keys — use t() to render.
 */

import type { CompressSettings } from '@pic-forge/codecs';

export interface Preset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  settings: CompressSettings;
}

/** Default resize config (disabled) shared across presets */
const noResize = {
  enabled: false,
  mode: 'absolute' as const,
  maxWidth: 1920,
  maxHeight: 1080,
  percentage: 50,
  method: 'contain' as const,
};

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    labelKey: 'presets.balanced.label',
    descriptionKey: 'presets.balanced.description',
    settings: {
      outputFormat: 'webp',
      quality: 75,
      resize: noResize,
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
      resize: noResize,
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
      resize: noResize,
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
      resize: noResize,
      advanced: { speed: 6, subsample: 1 },
    },
  },
];
