import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyColorPlan,
  embedIccProfile,
  parseMatrixProfile,
  planColorConversion,
  srgbDecode,
  srgbEncode,
} from './colorProfile';
import { findHeifMetaEnd, readHeifInfo } from './heif';

const sample = new URL('../../../../sample/ios/IMG_1539.HEIC', import.meta.url);

/** A matrix/TRC RGB ICC profile with a shared parametric (type 3) curve. */
function iccProfile(colorants: number[][], curve = [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045]) {
  const tags = ['rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'];
  const xyzSize = 20;
  const paraSize = 12 + curve.length * 4;
  const tableEnd = 132 + tags.length * 12;
  const size = tableEnd + 3 * xyzSize + paraSize;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => bytes.set([...value].map((c) => c.charCodeAt(0)), at);
  view.setUint32(0, size);
  text(12, 'mntr');
  text(16, 'RGB ');
  text(20, 'XYZ ');
  text(36, 'acsp');
  view.setUint32(128, tags.length);
  const fixed = (at: number, value: number) => view.setInt32(at, Math.round(value * 65536));
  const paraOffset = tableEnd + 3 * xyzSize;
  tags.forEach((tag, i) => {
    const at = 132 + i * 12;
    text(at, tag);
    view.setUint32(at + 4, i < 3 ? tableEnd + i * xyzSize : paraOffset);
    view.setUint32(at + 8, i < 3 ? xyzSize : paraSize);
  });
  colorants.forEach((xyz, i) => {
    const at = tableEnd + i * xyzSize;
    text(at, 'XYZ ');
    xyz.forEach((value, k) => fixed(at + 8 + k * 4, value));
  });
  text(paraOffset, 'para');
  view.setUint16(paraOffset + 8, 3);
  curve.forEach((value, k) => fixed(paraOffset + 12 + k * 4, value));
  return bytes;
}

const SRGB = [
  [0.4360747, 0.2225045, 0.0139322],
  [0.3850649, 0.7168786, 0.0971045],
  [0.1430804, 0.0606169, 0.7141733],
];
// Apple Display P3 colorants (PCS D50).
const DISPLAY_P3 = [
  [0.515121, 0.241196, -0.001053],
  [0.291977, 0.692245, 0.041885],
  [0.157104, 0.066574, 0.784073],
];

function convert(plan: ReturnType<typeof planColorConversion>, rgb: number[]) {
  const pixel = new Uint8ClampedArray([...rgb, 255]);
  applyColorPlan(plan, pixel);
  return [...pixel.subarray(0, 3)];
}
const p3 = (values: number[]) => values.map((value) => Math.round(value * 255));
function near(actual: number[], expected: number[], tolerance: number) {
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(tolerance));
}

describe('HEIF metadata', () => {
  it('finds the primary Display P3 profile, size and Exif item of the iPhone sample', async () => {
    const bytes = new Uint8Array(readFileSync(sample));
    const info = readHeifInfo(bytes)!;
    expect(info.width! * info.height!).toBe(4284 * 5712);
    expect(info.color.icc).toBeDefined();
    expect(parseMatrixProfile(info.color.icc!)).not.toBeNull();
    const plan = planColorConversion(info.color);
    expect(plan.kind).toBe('convert');
    // Published Display P3 → sRGB (linear) matrix.
    const published = [1.2249, -0.2247, 0, -0.042, 1.0419, 0, -0.0197, -0.0786, 1.0979];
    if (plan.kind === 'convert') {
      plan.matrix.forEach((value, i) => expect(Math.abs(value - published[i])).toBeLessThan(0.002));
    }
    expect(info.exif!.length).toBeGreaterThan(0);

    const metaEnd = await findHeifMetaEnd(new Blob([bytes]));
    const prefix = readHeifInfo(bytes.subarray(0, metaEnd), bytes.length)!;
    expect(prefix.exif).toEqual(info.exif);
    expect(prefix.color.icc).toEqual(info.color.icc);
  });

  it('rejects non-HEIF and truncated input without throwing', () => {
    expect(readHeifInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    const bytes = new Uint8Array(readFileSync(sample));
    expect(readHeifInfo(bytes.subarray(0, 200))).toBeNull();
  });
});

describe('colour conversion to sRGB', () => {
  it('maps Display P3 encodings of sRGB primaries back to them (CSS Color 4 references)', () => {
    const plan = planColorConversion({ icc: iccProfile(DISPLAY_P3) });
    expect(plan.kind).toBe('convert');
    // The references are rounded to 8 bits; near 0 the sRGB curve's 12.92 slope turns
    // that rounding into up to ~3 code values.
    near(convert(plan, p3([0.9175, 0.2003, 0.1386])), [255, 0, 0], 3);
    near(convert(plan, p3([0.4584, 0.9853, 0.2983])), [0, 255, 0], 3);
    near(convert(plan, [128, 128, 128]), [128, 128, 128], 1);
    expect(convert(plan, [255, 255, 255])).toEqual([255, 255, 255]);
    expect(convert(plan, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('clips out-of-gamut P3 colours instead of wrapping', () => {
    const plan = planColorConversion({ icc: iccProfile(DISPLAY_P3) });
    expect(convert(plan, [255, 0, 0])).toEqual([255, 0, 0]);
  });

  it('leaves sRGB profiles and untagged images unchanged', () => {
    expect(planColorConversion({ icc: iccProfile(SRGB) }).kind).toBe('none');
    expect(planColorConversion(undefined).kind).toBe('none');
    expect(planColorConversion({}).kind).toBe('none');
  });

  it('converts nclx P3-D65 like the ICC path and ignores HDR transfers', () => {
    const nclx = planColorConversion({
      nclx: { primaries: 12, transfer: 13, matrix: 6, fullRange: true },
    });
    const icc = planColorConversion({ icc: iccProfile(DISPLAY_P3) });
    for (const rgb of [
      [234, 51, 35],
      [117, 251, 76],
      [40, 90, 200],
    ]) {
      near(convert(nclx, rgb), convert(icc, rgb), 1);
    }
    expect(
      planColorConversion({ nclx: { primaries: 1, transfer: 13, matrix: 1, fullRange: true } }).kind,
    ).toBe('none');
    expect(
      planColorConversion({ nclx: { primaries: 9, transfer: 16, matrix: 9, fullRange: false } }).kind,
    ).toBe('none');
  });

  it('embeds LUT-only RGB profiles instead of guessing', () => {
    const lut = iccProfile(DISPLAY_P3);
    lut.set([...'rXYX'].map((c) => c.charCodeAt(0)), 132); // hide rXYZ: not matrix-shaper
    expect(planColorConversion({ icc: lut })).toEqual({ kind: 'embed', icc: lut });
  });

  it('round-trips the sRGB transfer functions', () => {
    for (let i = 0; i <= 255; i += 1) {
      expect(Math.round(srgbEncode(srgbDecode(i / 255)) * 255)).toBe(i);
    }
  });
});

describe('JPEG ICC embedding', () => {
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]).buffer;

  it('inserts APP2 ICC_PROFILE after the JFIF segment', () => {
    const icc = iccProfile(DISPLAY_P3);
    const output = new Uint8Array(embedIccProfile(jpeg, icc));
    expect([...output.subarray(0, 20)]).toEqual([...new Uint8Array(jpeg).subarray(0, 20)]);
    expect([output[20], output[21]]).toEqual([0xff, 0xe2]);
    expect(String.fromCharCode(...output.subarray(24, 35))).toBe('ICC_PROFILE');
    expect([output[36], output[37]]).toEqual([1, 1]);
    expect([...output.subarray(38, 38 + icc.length)]).toEqual([...icc]);
    expect([...output.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it('splits large profiles into numbered segments', () => {
    const icc = new Uint8Array(70_000).fill(7);
    const output = new Uint8Array(embedIccProfile(jpeg, icc));
    const first = 20;
    const firstLength = (output[first + 2] << 8) | output[first + 3];
    const second = first + 2 + firstLength;
    expect([output[first + 16], output[first + 17]]).toEqual([1, 2]);
    expect([output[second], output[second + 1]]).toEqual([0xff, 0xe2]);
    expect([output[second + 16], output[second + 17]]).toEqual([2, 2]);
    expect(output.length).toBe(jpeg.byteLength + icc.length + 2 * 18);
  });
});
