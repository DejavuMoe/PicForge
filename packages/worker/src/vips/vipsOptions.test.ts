import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, type CompressSettings } from '@pic-forge/codecs';
import { mapVipsEncoderOptions } from './vipsOptions';

const jpeg: CompressSettings = { outputFormat: 'mozjpeg', quality: 75, advanced: {} };
describe('Vips encoder setting coverage', () => {
  it('maps quality, progressive, coding, quantization and explicit chroma choices', () => {
    expect(
      mapVipsEncoderOptions({
        ...jpeg,
        advanced: {
          quality: 88,
          progressive: false,
          optimize_coding: false,
          quant_table: 2,
          auto_subsample: false,
          chroma_subsample: 1,
        },
      }),
    ).toEqual({
      format: 'mozjpeg',
      options: {
        Q: 88,
        interlace: false,
        optimize_coding: false,
        quant_table: 2,
        subsample_mode: 'off',
        trellis_quant: false,
        optimize_scans: false,
        keep: 'none',
      },
    });
    expect(
      mapVipsEncoderOptions({ ...jpeg, advanced: { auto_subsample: false, chroma_subsample: 2 } })
        ?.options,
    ).toHaveProperty('subsample_mode', 'on');
  });
  it.each(['mozjpeg', 'webp'] as const)('accepts a full default %s snapshot', (outputFormat) => {
    expect(
      mapVipsEncoderOptions({
        outputFormat,
        quality: 75,
        advanced: { ...DEFAULT_OPTIONS[outputFormat] },
      }),
    ).not.toBeNull();
  });
  it('normalizes JPEG quality zero without changing WebP quality zero', () => {
    expect(mapVipsEncoderOptions({ ...jpeg, quality: 0 })?.options.Q).toBe(1);
    expect(mapVipsEncoderOptions({ outputFormat: 'webp', quality: 0 })?.options.Q).toBe(0);
  });
  it('maps WebP lossless, effort, alpha and multipass options', () => {
    expect(
      mapVipsEncoderOptions({
        outputFormat: 'webp',
        quality: 63,
        advanced: {
          lossless: 1,
          method: 6,
          alpha_quality: 85,
          exact: 1,
          use_sharp_yuv: 1,
          pass: 3,
        },
      }),
    ).toMatchObject({
      format: 'webp',
      options: {
        Q: 63,
        lossless: true,
        effort: 6,
        alpha_q: 85,
        exact: true,
        smart_subsample: true,
        passes: 3,
        keep: 'none',
      },
    });
  });
  it.each([
    { ...jpeg, advanced: { arithmetic: true } },
    { ...jpeg, advanced: { chroma_subsample: 3, auto_subsample: false } },
    { ...jpeg, quality: 85 },
    { ...jpeg, advanced: { separate_chroma_quality: true } },
    { ...jpeg, advanced: { trellis_multipass: true } },
    { ...jpeg, advanced: { quality: NaN } },
    { outputFormat: 'webp', quality: 75, advanced: { sns_strength: 75 } },
    { outputFormat: 'webp', quality: 75, advanced: { near_lossless: 80 } },
    { outputFormat: 'webp', quality: 75, advanced: { method: 7 } },
    { outputFormat: 'oxipng', quality: 75 },
    { outputFormat: 'avif', quality: 75 },
  ] as CompressSettings[])('keeps unsupported settings on Compat: %j', (settings) => {
    expect(mapVipsEncoderOptions(settings)).toBeNull();
  });
});
