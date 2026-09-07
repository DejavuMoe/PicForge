import { describe, expect, it } from 'vitest';
import { AVIF_CHROMA_SUBSAMPLE, DEFAULT_OPTIONS } from '@pic-forge/codecs';
import type { CompressSettings } from '@pic-forge/codecs';
import { buildEncoderOptions } from './encoderOptions';

const avifSettings = (partial: Partial<CompressSettings> = {}): CompressSettings => ({
  outputFormat: 'avif',
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
  ...partial,
});

describe('buildEncoderOptions', () => {
  it('passes AVIF quality 75 and 100 through without 0–63 scaling', () => {
    expect(buildEncoderOptions(avifSettings({ quality: 75 })).quality).toBe(75);
    expect(buildEncoderOptions(avifSettings({ quality: 100 })).quality).toBe(100);
  });

  it('does not keep cqLevel / cqAlphaLevel in current AVIF defaults', () => {
    expect(DEFAULT_OPTIONS.avif).not.toHaveProperty('cqLevel');
    expect(DEFAULT_OPTIONS.avif).not.toHaveProperty('cqAlphaLevel');
    expect(DEFAULT_OPTIONS.avif.quality).toBe(75);
    expect(DEFAULT_OPTIONS.avif.qualityAlpha).toBe(-1);
  });

  it('maps leftover subsample 0 to 4:4:4 (3) after advanced merge', () => {
    const options = buildEncoderOptions(
      avifSettings({
        advanced: { speed: 6, subsample: 0 },
      }),
    );
    expect(options.subsample).toBe(AVIF_CHROMA_SUBSAMPLE.YUV444);
    expect(options.speed).toBe(6);
  });

  it('keeps 4:2:0 as subsample 1 and 4:4:4 as 3', () => {
    expect(
      buildEncoderOptions(avifSettings({ advanced: { subsample: AVIF_CHROMA_SUBSAMPLE.YUV420 } }))
        .subsample,
    ).toBe(1);
    expect(
      buildEncoderOptions(avifSettings({ advanced: { subsample: AVIF_CHROMA_SUBSAMPLE.YUV444 } }))
        .subsample,
    ).toBe(3);
  });

  it('lets advanced options overlay defaults without replacing UI quality unless advanced.quality is set', () => {
    const options = buildEncoderOptions(
      avifSettings({
        quality: 88,
        advanced: { speed: 4, subsample: 3 },
      }),
    );
    expect(options.quality).toBe(88);
    expect(options.speed).toBe(4);
    expect(options.subsample).toBe(3);
  });

  it('does not rescale JPEG or WebP quality', () => {
    expect(
      buildEncoderOptions({ ...avifSettings(), outputFormat: 'mozjpeg', quality: 75 }).quality,
    ).toBe(75);
    expect(
      buildEncoderOptions({ ...avifSettings(), outputFormat: 'webp', quality: 100 }).quality,
    ).toBe(100);
  });
});
