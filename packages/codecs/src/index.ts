/**
 * @pic-forge/codecs
 *
 * Image codec utilities for PicForge.
 * Provides codec loading and encoding functions.
 */

export { encodeImage, optimisePng } from './codecLoader';
import type { EncoderOptions, OutputFormat } from './types';

export type {
  OutputFormat,
  CompressSettings,
  ResizeOptions,
  ResizeMethod,
  MozjpegOptions,
  WebpOptions,
  AvifOptions,
  OxipngOptions,
  EncoderOptions,
} from './types';

export { AVIF_CHROMA_SUBSAMPLE } from './types';

/**
 * Default encoding options for each format.
 */
export const DEFAULT_OPTIONS = {
  mozjpeg: {
    quality: 75,
    baseline: false,
    arithmetic: false,
    progressive: true,
    optimize_coding: true,
    smoothing: 0,
    color_space: 3, // YCbCr
    quant_table: 3,
    trellis_multipass: false,
    trellis_opt_zero: false,
    trellis_opt_table: false,
    trellis_loops: 1,
    auto_subsample: true,
    chroma_subsample: 2,
    separate_chroma_quality: false,
    chroma_quality: 75,
  },
  webp: {
    quality: 75,
    target_size: 0,
    target_PSNR: 0,
    method: 4,
    sns_strength: 50,
    filter_strength: 60,
    filter_sharpness: 0,
    filter_type: 1,
    partitions: 0,
    segments: 4,
    pass: 1,
    show_compressed: 0,
    preprocessing: 0,
    autofilter: 0,
    partition_limit: 0,
    alpha_compression: 1,
    alpha_filtering: 1,
    alpha_quality: 100,
    lossless: 0,
    exact: 0,
    image_hint: 0,
    emulate_jpeg_size: 0,
    thread_level: 0,
    low_memory: 0,
    near_lossless: 100,
    use_delta_palette: 0,
    use_sharp_yuv: 0,
  },
  avif: {
    quality: 75,
    qualityAlpha: -1,
    denoiseLevel: 0,
    tileColsLog2: 0,
    tileRowsLog2: 0,
    speed: 6,
    subsample: 1,
    chromaDeltaQ: false,
    sharpness: 0,
    tune: 0, // AVIF_TUNE_AUTO
  },
  oxipng: {
    level: 2,
    interlace: false,
    optimizeAlpha: false,
  },
} as const;

/**
 * Advanced options that belong to each output format. Settings keep one flat
 * `advanced` object, so anything outside the active format's keys is stale state
 * from another format and must never reach its encoder (for example WebP
 * `lossless` would switch jSquash AVIF to lossless mode).
 */
export const ADVANCED_OPTION_KEYS: Record<OutputFormat, ReadonlySet<string>> = {
  mozjpeg: new Set(Object.keys(DEFAULT_OPTIONS.mozjpeg)),
  webp: new Set(Object.keys(DEFAULT_OPTIONS.webp)),
  avif: new Set(Object.keys(DEFAULT_OPTIONS.avif)),
  oxipng: new Set(Object.keys(DEFAULT_OPTIONS.oxipng)),
};

/** Keep only the active format's advanced options; unknown formats keep nothing. */
export function sanitizeAdvancedOptions(
  format: OutputFormat,
  advanced: Partial<EncoderOptions> | undefined,
): Partial<EncoderOptions> {
  const allowed = ADVANCED_OPTION_KEYS[format];
  const result: Record<string, unknown> = {};
  if (!allowed || !advanced) return result;
  for (const [key, value] of Object.entries(advanced)) {
    if (allowed.has(key) && value !== undefined) result[key] = value;
  }
  return result as Partial<EncoderOptions>;
}
