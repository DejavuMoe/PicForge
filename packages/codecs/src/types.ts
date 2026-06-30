/**
 * Supported output image formats.
 */
export type OutputFormat = 'mozjpeg' | 'webp' | 'avif' | 'oxipng';

/**
 * Resize fit method.
 */
export type ResizeMethod = 'contain' | 'cover' | 'stretch';

/**
 * Resize mode: absolute pixel dimensions or percentage scaling.
 */
export type ResizeMode = 'absolute' | 'percentage';

/**
 * Resize options.
 */
export interface ResizeOptions {
  enabled: boolean;
  /** Resize mode: 'absolute' uses maxWidth/maxHeight, 'percentage' uses percentage */
  mode: ResizeMode;
  /** Max width in pixels (absolute mode) */
  maxWidth: number;
  /** Max height in pixels (absolute mode) */
  maxHeight: number;
  /** Scale percentage 1-100 (percentage mode) */
  percentage: number;
  method: ResizeMethod;
}

/**
 * MozJPEG encoding options.
 */
export interface MozjpegOptions {
  quality: number;
  baseline: boolean;
  arithmetic: boolean;
  progressive: boolean;
  optimize_coding: boolean;
  smoothing: number;
  color_space: number;
  quant_table: number;
  trellis_multipass: boolean;
  trellis_opt_zero: boolean;
  trellis_opt_table: boolean;
  trellis_loops: number;
  auto_subsample: boolean;
  chroma_subsample: number;
  separate_chroma_quality: boolean;
  chroma_quality: number;
}

/**
 * WebP encoding options.
 */
export interface WebpOptions {
  quality: number;
  target_size: number;
  target_PSNR: number;
  method: number;
  sns_strength: number;
  filter_strength: number;
  filter_sharpness: number;
  filter_type: number;
  partitions: number;
  segments: number;
  pass: number;
  show_compressed: number;
  preprocessing: number;
  autofilter: number;
  partition_limit: number;
  alpha_compression: number;
  alpha_filtering: number;
  alpha_quality: number;
  lossless: number;
  exact: number;
  image_hint: number;
  emulate_jpeg_size: number;
  thread_level: number;
  low_memory: number;
  near_lossless: number;
  use_delta_palette: number;
  use_sharp_yuv: number;
}

/**
 * AVIF encoding options.
 */
export interface AvifOptions {
  cqLevel: number;
  cqAlphaLevel: number;
  denoiseLevel: number;
  tileColsLog2: number;
  tileRowsLog2: number;
  speed: number;
  subsample: number;
  chromaDeltaQ: boolean;
  sharpness: number;
  tune: number;
}

/**
 * OxiPNG encoding options.
 */
export interface OxipngOptions {
  level: number;
  interlace: boolean;
  optimizeAlpha: boolean;
}

/**
 * Union of all encoder options.
 */
export type EncoderOptions = MozjpegOptions | WebpOptions | AvifOptions | OxipngOptions;

/**
 * Full compression settings.
 */
export interface CompressSettings {
  outputFormat: OutputFormat;
  quality: number;
  resize?: ResizeOptions;
  advanced?: Partial<EncoderOptions>;
}
