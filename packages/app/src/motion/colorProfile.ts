/**
 * Colour conversion for the HEIC → JPEG path.
 *
 * libheif returns RGB in the image's own colour space (iPhone photos: Display
 * P3) and does no colour management. MozJPEG writes no ICC profile, so viewers
 * would interpret those values as sRGB and show desaturated colours. Like the
 * Canvas compression path, the export is converted to sRGB
 * (relative colorimetric, out-of-gamut values clipped).
 *
 * Supported: ICC matrix/TRC RGB profiles (curv/para curves) and nclx with BT.709,
 * BT.2020 or P3-D65 primaries and SDR transfer functions. LUT-based RGB ICC
 * profiles cannot be converted here; their JPEG embeds the original profile so
 * colour-managed viewers still render it correctly. HDR transfers (PQ/HLG) and
 * grey profiles are left unchanged.
 */

import type { HeifColor, NclxColor } from './heif';

type Matrix = [number, number, number, number, number, number, number, number, number];
type Curve = (value: number) => number;

/** sRGB colorants from the sRGB IEC61966-2.1 ICC profile (PCS/D50, Bradford-adapted). */
const SRGB_D50: Matrix = [
  0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045,
  0.7141733,
];

export type ColorPlan =
  | { kind: 'none' }
  | { kind: 'convert'; matrix: Matrix; curves: [Curve, Curve, Curve] }
  | { kind: 'embed'; icc: Uint8Array };

export function srgbDecode(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function srgbEncode(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Decide how to bring the decoded RGB into sRGB. */
export function planColorConversion(color: HeifColor | undefined): ColorPlan {
  if (color?.icc) {
    const profile = parseMatrixProfile(color.icc);
    if (profile) {
      const matrix = multiply(invert(SRGB_D50), profile.colorants);
      return isSrgb(matrix, profile.curves) ? { kind: 'none' } : { kind: 'convert', matrix, curves: profile.curves };
    }
    return iccColorSpace(color.icc) === 'RGB ' ? { kind: 'embed', icc: color.icc } : { kind: 'none' };
  }
  if (color?.nclx) return planNclx(color.nclx);
  return { kind: 'none' };
}

/** Convert interleaved RGBA in place. */
export function applyColorPlan(plan: ColorPlan, rgba: Uint8ClampedArray | Uint8Array): void {
  if (plan.kind !== 'convert') return;
  const linear = plan.curves.map((curve) => {
    const table = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) table[i] = curve(i / 255);
    return table;
  });
  const steps = 16384;
  const encode = new Uint8Array(steps + 1);
  for (let i = 0; i <= steps; i += 1) encode[i] = Math.round(srgbEncode(i / steps) * 255);
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = plan.matrix;
  const [lr, lg, lb] = linear;
  const out = (value: number) => encode[value <= 0 ? 0 : value >= 1 ? steps : (value * steps + 0.5) | 0];
  for (let i = 0; i < rgba.length; i += 4) {
    const r = lr[rgba[i]];
    const g = lg[rgba[i + 1]];
    const b = lb[rgba[i + 2]];
    rgba[i] = out(m0 * r + m1 * g + m2 * b);
    rgba[i + 1] = out(m3 * r + m4 * g + m5 * b);
    rgba[i + 2] = out(m6 * r + m7 * g + m8 * b);
  }
}

/**
 * Insert an ICC profile as APP2 ICC_PROFILE segments after SOI and a leading
 * APP0 (JFIF) segment.
 */
export function embedIccProfile(jpeg: ArrayBuffer, icc: Uint8Array): ArrayBuffer {
  const bytes = new Uint8Array(jpeg);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG');
  let insert = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) insert = 4 + ((bytes[4] << 8) | bytes[5]);
  const chunk = 65519;
  const count = Math.ceil(icc.length / chunk);
  if (count < 1 || count > 255) throw new Error('Invalid ICC profile size');
  const signature = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0];
  const segments: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const data = icc.subarray(index * chunk, (index + 1) * chunk);
    const length = 2 + signature.length + 2 + data.length;
    const segment = new Uint8Array(2 + length);
    segment.set([0xff, 0xe2, length >> 8, length & 255, ...signature, index + 1, count]);
    segment.set(data, 4 + signature.length + 2);
    segments.push(segment);
  }
  const size = bytes.length + segments.reduce((sum, segment) => sum + segment.length, 0);
  const output = new Uint8Array(size);
  output.set(bytes.subarray(0, insert), 0);
  let offset = insert;
  for (const segment of segments) {
    output.set(segment, offset);
    offset += segment.length;
  }
  output.set(bytes.subarray(insert), offset);
  return output.buffer;
}

interface MatrixProfile {
  colorants: Matrix;
  curves: [Curve, Curve, Curve];
}

function iccColorSpace(icc: Uint8Array): string {
  return icc.length >= 20 ? String.fromCharCode(...icc.subarray(16, 20)) : '';
}

/** Parse an RGB matrix/TRC ICC profile; null for anything else. */
export function parseMatrixProfile(icc: Uint8Array): MatrixProfile | null {
  try {
    if (icc.length < 132 || iccColorSpace(icc) !== 'RGB ') return null;
    const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    if (String.fromCharCode(...icc.subarray(20, 24)) !== 'XYZ ') return null;
    const count = view.getUint32(128);
    if (count > 1000 || 132 + count * 12 > icc.length) return null;
    const tags = new Map<string, { offset: number; size: number }>();
    for (let i = 0; i < count; i += 1) {
      const at = 132 + i * 12;
      const offset = view.getUint32(at + 4);
      const size = view.getUint32(at + 8);
      if (offset + size > icc.length) return null;
      tags.set(String.fromCharCode(...icc.subarray(at, at + 4)), { offset, size });
    }
    // Prefer the matrix/TRC model; profiles relying on A2B LUTs are not matrix-shaper.
    const xyz = ['rXYZ', 'gXYZ', 'bXYZ'].map((name) => readXyz(view, tags.get(name)));
    const curves = ['rTRC', 'gTRC', 'bTRC'].map((name) => readCurve(view, tags.get(name)));
    if (xyz.some((value) => !value) || curves.some((curve) => !curve)) return null;
    const [r, g, b] = xyz as [number, number, number][];
    return {
      colorants: [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]],
      curves: curves as [Curve, Curve, Curve],
    };
  } catch {
    return null;
  }
}

const s15 = (view: DataView, at: number) => view.getInt32(at) / 65536;

function readXyz(view: DataView, tag?: { offset: number; size: number }): [number, number, number] | null {
  if (!tag || tag.size < 20) return null;
  if (tagType(view, tag.offset) !== 'XYZ ') return null;
  return [s15(view, tag.offset + 8), s15(view, tag.offset + 12), s15(view, tag.offset + 16)];
}

function tagType(view: DataView, at: number): string {
  return String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3),
  );
}

function readCurve(view: DataView, tag?: { offset: number; size: number }): Curve | null {
  if (!tag || tag.size < 12) return null;
  const type = tagType(view, tag.offset);
  if (type === 'curv') {
    const entries = view.getUint32(tag.offset + 8);
    if (12 + entries * 2 > tag.size) return null;
    if (entries === 0) return (x) => x;
    if (entries === 1) {
      const gamma = view.getUint16(tag.offset + 12) / 256;
      return (x) => x ** gamma;
    }
    const table = new Float64Array(entries);
    for (let i = 0; i < entries; i += 1) table[i] = view.getUint16(tag.offset + 12 + i * 2) / 65535;
    return (x) => {
      const position = Math.min(1, Math.max(0, x)) * (entries - 1);
      const index = Math.floor(position);
      const next = Math.min(entries - 1, index + 1);
      return table[index] + (table[next] - table[index]) * (position - index);
    };
  }
  if (type === 'para') {
    const kind = view.getUint16(tag.offset + 8);
    const counts = [1, 3, 4, 5, 7];
    if (kind > 4 || 12 + counts[kind] * 4 > tag.size) return null;
    const p = Array.from({ length: counts[kind] }, (_, i) => s15(view, tag.offset + 12 + i * 4));
    const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = p;
    const power = (value: number) => (value > 0 ? value ** g : 0);
    switch (kind) {
      case 0:
        return (x) => power(x);
      case 1:
        return (x) => (x >= -b / a ? power(a * x + b) : 0);
      case 2:
        return (x) => (x >= -b / a ? power(a * x + b) + c : c);
      case 3:
        return (x) => (x >= d ? power(a * x + b) : c * x);
      default:
        return (x) => (x >= d ? power(a * x + b) + e : c * x + f);
    }
  }
  return null;
}

/** CIE xy chromaticities (red, green, blue) for supported nclx primaries; all D65. */
const NCLX_PRIMARIES: Record<number, [number, number, number, number, number, number]> = {
  1: [0.64, 0.33, 0.3, 0.6, 0.15, 0.06],
  9: [0.708, 0.292, 0.17, 0.797, 0.131, 0.046],
  12: [0.68, 0.32, 0.265, 0.69, 0.15, 0.06],
};
const D65: [number, number] = [0.3127, 0.329];

function planNclx(nclx: NclxColor): ColorPlan {
  if (nclx.primaries === 1 || nclx.primaries === 2) return { kind: 'none' };
  const primaries = NCLX_PRIMARIES[nclx.primaries];
  const curve = nclxCurve(nclx.transfer);
  if (!primaries || !curve) return { kind: 'none' };
  const matrix = multiply(invert(rgbToXyz(NCLX_PRIMARIES[1])), rgbToXyz(primaries));
  return { kind: 'convert', matrix, curves: [curve, curve, curve] };
}

function nclxCurve(transfer: number): Curve | null {
  // Unspecified, BT.709/601/2020 SDR and sRGB are displayed with the sRGB curve,
  // as browsers do for SDR images; HDR transfers are not tone-mapped here.
  if ([1, 2, 6, 13, 14, 15].includes(transfer)) return srgbDecode;
  if (transfer === 4) return (x) => x ** 2.2;
  if (transfer === 8) return (x) => x;
  return null;
}

function rgbToXyz([rx, ry, gx, gy, bx, by]: [number, number, number, number, number, number]): Matrix {
  const column = (x: number, y: number) => [x / y, 1, (1 - x - y) / y];
  const [r, g, b] = [column(rx, ry), column(gx, gy), column(bx, by)];
  const primaries: Matrix = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
  const white = column(...D65);
  const inverse = invert(primaries);
  const s = [0, 1, 2].map(
    (row) => inverse[row * 3] * white[0] + inverse[row * 3 + 1] * white[1] + inverse[row * 3 + 2] * white[2],
  );
  return primaries.map((value, index) => value * s[index % 3]) as Matrix;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const result = new Array(9).fill(0) as Matrix;
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 3; column += 1)
      for (let k = 0; k < 3; k += 1) result[row * 3 + column] += a[row * 3 + k] * b[k * 3 + column];
  return result;
}

function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  if (Math.abs(determinant) < 1e-12) throw new Error('Singular colour matrix');
  return [
    A / determinant,
    -(b * i - c * h) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * i - c * g) / determinant,
    -(a * f - c * d) / determinant,
    C / determinant,
    -(a * h - b * g) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function isSrgb(matrix: Matrix, curves: [Curve, Curve, Curve]): boolean {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (matrix.some((value, index) => Math.abs(value - identity[index]) > 0.002)) return false;
  for (let i = 0; i <= 255; i += 1) {
    const expected = srgbDecode(i / 255);
    if (curves.some((curve) => Math.abs(curve(i / 255) - expected) > 0.5 / 255)) return false;
  }
  return true;
}
