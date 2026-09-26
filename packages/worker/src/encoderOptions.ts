/**
 * Assemble WASM encoder options from UI compression settings.
 *
 * AVIF uses the current @jsquash/avif 0–100 `quality` contract. A leftover
 * subsample of 0 (old 4:4:4 UI value) is mapped to YUV444 (3); 0 would encode
 * a monochrome image.
 *
 * Only the output format's own advanced keys reach its encoder. Settings share
 * one flat `advanced` object across formats, and jSquash encoders interpret
 * foreign keys (AVIF treats a truthy WebP `lossless` as lossless mode).
 */

import { AVIF_CHROMA_SUBSAMPLE, DEFAULT_OPTIONS, sanitizeAdvancedOptions } from '@pic-forge/codecs';
import type { CompressSettings } from '@pic-forge/codecs';

const AVIF_LEGACY_YUV444_SUBSAMPLE = 0;

export function buildEncoderOptions(settings: CompressSettings): Record<string, unknown> {
  const defaults = DEFAULT_OPTIONS[settings.outputFormat as keyof typeof DEFAULT_OPTIONS];
  const quality = Math.max(0, Math.min(100, Math.round(Number(settings.quality))));
  const encoderOptions: Record<string, unknown> = {
    ...(defaults as Record<string, unknown> | undefined),
    quality,
    ...sanitizeAdvancedOptions(settings.outputFormat, settings.advanced),
  };

  if (settings.outputFormat === 'avif' && encoderOptions.subsample === AVIF_LEGACY_YUV444_SUBSAMPLE) {
    encoderOptions.subsample = AVIF_CHROMA_SUBSAMPLE.YUV444;
  }

  return encoderOptions;
}
