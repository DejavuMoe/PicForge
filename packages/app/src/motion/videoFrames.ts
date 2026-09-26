/**
 * Frame geometry and pixel work for the WebCodecs Live Photo path. Geometry follows
 * the FFmpeg path exactly: rotate by the track matrix, crop the clean aperture in the
 * rotated frame (rounded down to even, as the crop filter does), then fit inside the
 * preset edge with even dimensions. Pixels stay in YUV, so values and colour tags
 * match the FFmpeg conversion; full-range input becomes limited range like swscale.
 */

import type { VideoTrackInfo } from './movDemux';

export interface FramePlan {
  /** Decoded (source) frame size. */
  sourceWidth: number;
  sourceHeight: number;
  rotation: 0 | 90 | 180 | 270;
  /** Crop rectangle in the rotated frame. */
  crop: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}

const rescale = (a: number, b: number, c: number) => Math.floor((a * b + Math.floor(c / 2)) / c);

/**
 * FFmpeg `scale=w='min(iw,E)':h='min(ih,E)':force_original_aspect_ratio=decrease:
 * force_divisible_by=2` output size.
 */
export function fitDimensions(width: number, height: number, edge: number) {
  let w = Math.min(width, edge);
  let h = Math.min(height, edge);
  const fitW = rescale(h, width, height);
  const fitH = rescale(w, height, width);
  w = Math.min(w, fitW);
  h = Math.min(h, fitH);
  return { width: Math.floor(w / 2) * 2, height: Math.floor(h / 2) * 2 };
}

export function planFrames(
  info: Pick<VideoTrackInfo, 'clap' | 'rotation'>,
  sourceWidth: number,
  sourceHeight: number,
  edge: number,
): FramePlan {
  if (sourceWidth % 2 || sourceHeight % 2) throw new Error('unsupportedMovie');
  const turned = info.rotation === 90 || info.rotation === 270;
  const rotatedWidth = turned ? sourceHeight : sourceWidth;
  const rotatedHeight = turned ? sourceWidth : sourceHeight;
  let crop = { x: 0, y: 0, width: rotatedWidth, height: rotatedHeight };
  if (info.clap) {
    const { width, height } = info.clap;
    const x = (sourceWidth - width) / 2 + info.clap.horizontal;
    const y = (sourceHeight - height) / 2 + info.clap.vertical;
    if (x < 0 || y < 0 || x + width > sourceWidth || y + height > sourceHeight)
      throw new Error('videoFailed');
    // Same mapping as cleanApertureFilters for the autorotated frame.
    const rotated =
      info.rotation === 90
        ? [height, width, sourceHeight - y - height, x]
        : info.rotation === 270
          ? [height, width, y, sourceWidth - x - width]
          : info.rotation === 180
            ? [width, height, sourceWidth - x - width, sourceHeight - y - height]
            : [width, height, x, y];
    const [w, h, cx, cy] = rotated.map(Math.floor);
    // The crop filter (exact=0) aligns offsets and sizes to the 4:2:0 chroma grid.
    crop = { x: cx & ~1, y: cy & ~1, width: w & ~1, height: h & ~1 };
  }
  const size = fitDimensions(crop.width, crop.height, edge);
  if (!size.width || !size.height) throw new Error('videoFailed');
  return { sourceWidth, sourceHeight, rotation: info.rotation, crop, ...size };
}

/** Full-range (JPEG) to limited-range (MPEG) lookup tables. */
const LIMITED_LUMA = Uint8Array.from({ length: 256 }, (_, value) =>
  Math.round(16 + (value * 219) / 255),
);
const LIMITED_CHROMA = Uint8Array.from({ length: 256 }, (_, value) =>
  Math.round(128 + ((value - 128) * 224) / 255),
);
const IDENTITY = Uint8Array.from({ length: 256 }, (_, value) => value);

export interface PlaneSource {
  data: Uint8Array;
  offset: number;
  stride: number;
  /** 1 for planar samples, 2 for interleaved NV12 chroma (U at +0, V at +1). */
  step: number;
}

/**
 * Source index of a rotated-frame position (rx, ry) is `origin + rx * ax + ry * ay`:
 * a right-angle rotation only swaps and mirrors the two source axes.
 */
function axes(rotation: FramePlan['rotation'], width: number, height: number, plane: PlaneSource) {
  const { stride, offset, step } = plane;
  switch (rotation) {
    case 0:
      return { origin: offset, ax: step, ay: stride };
    case 90: // (sx, sy) = (ry, H-1-rx)
      return { origin: offset + (height - 1) * stride, ax: -stride, ay: step };
    case 180: // (sx, sy) = (W-1-rx, H-1-ry)
      return {
        origin: offset + (height - 1) * stride + (width - 1) * step,
        ax: -step,
        ay: -stride,
      };
    case 270: // (sx, sy) = (W-1-ry, rx)
      return { origin: offset + (width - 1) * step, ax: stride, ay: -step };
  }
}

/** Bilinear taps for one output axis: two clamped source positions and a weight. */
function taps(count: number, start: number, scale: number, limit: number) {
  const first = new Int32Array(count);
  const second = new Int32Array(count);
  const weight = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const position = start + (index + 0.5) * scale - 0.5;
    const floor = Math.floor(position);
    first[index] = Math.min(limit - 1, Math.max(0, floor));
    second[index] = Math.min(limit - 1, Math.max(0, floor + 1));
    weight[index] = position - floor;
  }
  return { first, second, weight };
}

/**
 * Write one output plane. `width`/`height` are the source plane size; `crop` and
 * `out` are in this plane's pixels. Unscaled planes copy exactly; scaled planes use
 * bilinear sampling (only for odd or oversized clean apertures and the compact preset).
 */
function writePlane(
  source: PlaneSource,
  rotation: FramePlan['rotation'],
  width: number,
  height: number,
  crop: { x: number; y: number; width: number; height: number },
  out: Uint8Array,
  outOffset: number,
  outWidth: number,
  outHeight: number,
  lut: Uint8Array,
) {
  const { data } = source;
  const { origin, ax, ay } = axes(rotation, width, height, source);
  if (outWidth === crop.width && outHeight === crop.height) {
    for (let row = 0; row < outHeight; row += 1) {
      let index = origin + crop.x * ax + (crop.y + row) * ay;
      let target = outOffset + row * outWidth;
      for (let column = 0; column < outWidth; column += 1, index += ax)
        out[target++] = lut[data[index]];
    }
    return;
  }
  const turned = rotation === 90 || rotation === 270;
  const columns = taps(outWidth, crop.x, crop.width / outWidth, turned ? height : width);
  const rows = taps(outHeight, crop.y, crop.height / outHeight, turned ? width : height);
  for (let row = 0; row < outHeight; row += 1) {
    const top = origin + rows.first[row] * ay;
    const bottom = origin + rows.second[row] * ay;
    const fy = rows.weight[row];
    let target = outOffset + row * outWidth;
    for (let column = 0; column < outWidth; column += 1) {
      const left = columns.first[column] * ax;
      const right = columns.second[column] * ax;
      const fx = columns.weight[column];
      const upper = data[top + left] + (data[top + right] - data[top + left]) * fx;
      const lower = data[bottom + left] + (data[bottom + right] - data[bottom + left]) * fx;
      out[target++] = lut[Math.round(upper + (lower - upper) * fy)];
    }
  }
}

export interface DecodedPlanes {
  format: 'I420' | 'NV12';
  data: Uint8Array;
  layout: Array<{ offset: number; stride: number }>;
  fullRange: boolean;
}

/** Build the I420 output frame (Y, then U, then V) for one decoded frame. */
export function transformFrame(
  plan: FramePlan,
  input: DecodedPlanes,
  out?: Uint8Array,
): Uint8Array {
  const { width, height, crop, rotation, sourceWidth, sourceHeight } = plan;
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const result = out ?? new Uint8Array(width * height + chromaWidth * chromaHeight * 2);
  const luma = input.fullRange ? LIMITED_LUMA : IDENTITY;
  const chroma = input.fullRange ? LIMITED_CHROMA : IDENTITY;
  writePlane(
    { data: input.data, offset: input.layout[0].offset, stride: input.layout[0].stride, step: 1 },
    rotation,
    sourceWidth,
    sourceHeight,
    crop,
    result,
    0,
    width,
    height,
    luma,
  );
  const chromaCrop = {
    x: crop.x / 2,
    y: crop.y / 2,
    width: crop.width / 2,
    height: crop.height / 2,
  };
  const planes: PlaneSource[] =
    input.format === 'I420'
      ? [1, 2].map((plane) => ({
          data: input.data,
          offset: input.layout[plane].offset,
          stride: input.layout[plane].stride,
          step: 1,
        }))
      : [0, 1].map((component) => ({
          data: input.data,
          offset: input.layout[1].offset + component,
          stride: input.layout[1].stride,
          step: 2,
        }));
  planes.forEach((plane, index) =>
    writePlane(
      plane,
      rotation,
      sourceWidth / 2,
      sourceHeight / 2,
      chromaCrop,
      result,
      width * height + index * chromaWidth * chromaHeight,
      chromaWidth,
      chromaHeight,
      chroma,
    ),
  );
  return result;
}

/**
 * ISO/IEC 23091-2 code points ↔ WebCodecs VideoColorSpace names (the current
 * registry, wider than the TypeScript DOM enums).
 */
const PRIMARIES: Record<number, string> = {
  1: 'bt709',
  5: 'bt470bg',
  6: 'smpte170m',
  9: 'bt2020',
  12: 'smpte432',
};
const TRANSFER: Record<number, string> = {
  1: 'bt709',
  6: 'smpte170m',
  8: 'linear',
  13: 'iec61966-2-1',
  16: 'pq',
  18: 'hlg',
};
const MATRIX: Record<number, string> = {
  0: 'rgb',
  1: 'bt709',
  5: 'bt470bg',
  6: 'smpte170m',
  9: 'bt2020-ncl',
};
function code(table: Record<number, string>, name?: string | null) {
  const key = name ? Object.keys(table).find((entry) => table[Number(entry)] === name) : undefined;
  return key === undefined ? undefined : Number(key);
}

export function colourCodes(
  tagged: VideoTrackInfo['colour'],
  decoded?: VideoColorSpaceInit,
): { primaries: number; transfer: number; matrix: number } | undefined {
  const primaries = tagged?.primaries ?? code(PRIMARIES, decoded?.primaries);
  const transfer = tagged?.transfer ?? code(TRANSFER, decoded?.transfer);
  const matrix = tagged?.matrix ?? code(MATRIX, decoded?.matrix);
  if (primaries === undefined || transfer === undefined || matrix === undefined) return undefined;
  return { primaries, transfer, matrix };
}

export function colourSpaceInit(codes: { primaries: number; transfer: number; matrix: number }) {
  return {
    primaries: (PRIMARIES[codes.primaries] ?? null) as VideoColorPrimaries | null,
    transfer: (TRANSFER[codes.transfer] ?? null) as VideoTransferCharacteristics | null,
    matrix: (MATRIX[codes.matrix] ?? null) as VideoMatrixCoefficients | null,
    fullRange: false,
  } satisfies VideoColorSpaceInit;
}

/** H.264 codec strings to try, best first, with a level that fits the frame. */
export function avcCodecs(width: number, height: number): string[] {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level =
    macroblocks <= 3600 ? 0x1f : macroblocks <= 8192 ? 0x29 : macroblocks <= 22080 ? 0x32 : 0x33;
  const suffix = level.toString(16).padStart(2, '0');
  return [`avc1.6400${suffix}`, `avc1.4d00${suffix}`, `avc1.4200${suffix}`];
}
