import type Vips from 'wasm-vips';
import { DEFAULT_OPTIONS, type CompressSettings } from '@pic-forge/codecs';
import { buildEncoderOptions } from '../encoderOptions';

export type VipsEncoderOptions =
  | { format: 'mozjpeg'; options: NonNullable<Parameters<Vips.Image['jpegsaveBuffer']>[0]> }
  | { format: 'webp'; options: NonNullable<Parameters<Vips.Image['webpsaveBuffer']>[0]> };

const jpegKeys = new Set([
  'quality',
  'progressive',
  'optimize_coding',
  'quant_table',
  'auto_subsample',
  'chroma_subsample',
]);
const webpKeys = new Set([
  'quality',
  'method',
  'lossless',
  'exact',
  'alpha_quality',
  'use_sharp_yuv',
  'target_size',
  'pass',
  'autofilter',
]);
const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number =>
  between(value, min, max) && Number.isInteger(value);

/** Unsupported advanced changes must retain the original encoder's semantics. */
export function mapVipsEncoderOptions(settings: CompressSettings): VipsEncoderOptions | null {
  const format = settings.outputFormat;
  if (format !== 'mozjpeg' && format !== 'webp') return null;
  const defaults = DEFAULT_OPTIONS[format] as Record<string, unknown>;
  const mapped = format === 'mozjpeg' ? jpegKeys : webpKeys;
  for (const [key, value] of Object.entries(settings.advanced ?? {})) {
    if (!mapped.has(key) && (!(key in defaults) || value !== defaults[key])) return null;
  }
  const options = buildEncoderOptions(settings);
  if (!integer(options.quality, 0, 100)) return null;
  if (format === 'mozjpeg') {
    if (
      typeof options.progressive !== 'boolean' ||
      typeof options.optimize_coding !== 'boolean' ||
      typeof options.auto_subsample !== 'boolean' ||
      !integer(options.quant_table, 0, 8) ||
      ![1, 2].includes(options.chroma_subsample as number)
    )
      return null;
    // MozJPEG's set_quality_ratings selects 4:2:2 for automatic Q 80..89.
    // libvips exposes only 4:4:4 / 4:2:0; preserve that band via Compat.
    if (options.auto_subsample && options.quality >= 80 && options.quality < 90) return null;
    return {
      format,
      options: {
        // MozJPEG normalizes 0 to 1; libvips rejects Q=0 instead of doing so.
        Q: Math.max(1, options.quality),
        interlace: options.progressive,
        optimize_coding: options.optimize_coding,
        quant_table: options.quant_table,
        subsample_mode: options.auto_subsample
          ? 'auto'
          : options.chroma_subsample === 1
            ? 'off'
            : 'on',
        trellis_quant: false,
        optimize_scans: false,
        keep: 'none',
      },
    };
  }
  if (
    !integer(options.method, 0, 6) ||
    !integer(options.lossless, 0, 1) ||
    !integer(options.exact, 0, 1) ||
    !integer(options.use_sharp_yuv, 0, 1) ||
    !integer(options.autofilter, 0, 1) ||
    !integer(options.pass, 1, 10) ||
    !integer(options.target_size, 0, 0x7fffffff) ||
    !integer(options.alpha_quality, 0, 100)
  )
    return null;
  return {
    format,
    options: {
      Q: options.quality,
      effort: options.method,
      lossless: options.lossless === 1,
      exact: options.exact === 1,
      alpha_q: options.alpha_quality,
      smart_subsample: options.use_sharp_yuv === 1,
      smart_deblock: options.autofilter === 1,
      passes: options.pass,
      target_size: options.target_size,
      keep: 'none',
    },
  };
}
