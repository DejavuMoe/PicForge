import { describe, expect, it } from 'vitest';
import {
  avcCodecs,
  colourCodes,
  colourSpaceInit,
  fitDimensions,
  planFrames,
  transformFrame,
  type FramePlan,
} from './videoFrames';

describe('fitDimensions', () => {
  it('matches the FFmpeg scale expression used by the conversion', () => {
    expect(fitDimensions(1308, 1744, 1920)).toEqual({ width: 1308, height: 1744 });
    expect(fitDimensions(1744, 1308, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitDimensions(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
    // Odd sizes become even.
    expect(fitDimensions(1307, 1745, 1920)).toEqual({ width: 1306, height: 1744 });
  });
});

describe('planFrames', () => {
  const clap = { width: 1744, height: 1308, horizontal: 0, vertical: 0 };
  it('maps the clean aperture into the rotated frame for every right angle', () => {
    const crop = (rotation: 0 | 90 | 180 | 270) =>
      planFrames({ clap, rotation }, 1920, 1440, 1920).crop;
    expect(crop(0)).toEqual({ x: 88, y: 66, width: 1744, height: 1308 });
    expect(crop(90)).toEqual({ x: 66, y: 88, width: 1308, height: 1744 });
    expect(crop(180)).toEqual({ x: 88, y: 66, width: 1744, height: 1308 });
    expect(crop(270)).toEqual({ x: 66, y: 88, width: 1308, height: 1744 });
    const offset = planFrames(
      { clap: { ...clap, horizontal: 10, vertical: -4 }, rotation: 90 },
      1920,
      1440,
      1920,
    ).crop;
    // x' = H - y - h, y' = x, like cleanApertureFilters.
    expect(offset).toEqual({ x: 70, y: 98, width: 1308, height: 1744 });
  });

  it('aligns odd crops to the chroma grid and rejects apertures outside the frame', () => {
    const odd = planFrames(
      { clap: { width: 1001, height: 601, horizontal: 0.5, vertical: 0 }, rotation: 0 },
      1920,
      1440,
      1920,
    );
    expect(odd.crop).toEqual({ x: 460, y: 418, width: 1000, height: 600 });
    expect(() =>
      planFrames(
        { clap: { ...clap, horizontal: 200, vertical: 0 }, rotation: 0 },
        1920,
        1440,
        1920,
      ),
    ).toThrow('videoFailed');
    expect(() => planFrames({ rotation: 0 }, 1921, 1440, 1920)).toThrow();
  });
});

describe('transformFrame', () => {
  // 4x2 luma 0..7, 2x1 chroma.
  const luma = [0, 1, 2, 3, 4, 5, 6, 7];
  const i420 = Uint8Array.from([...luma, 100, 101, 200, 201]);
  const layout = [
    { offset: 0, stride: 4 },
    { offset: 8, stride: 2 },
    { offset: 10, stride: 2 },
  ];
  const plan = (
    rotation: FramePlan['rotation'],
    crop = { x: 0, y: 0, width: 2, height: 4 },
  ): FramePlan => ({
    sourceWidth: 4,
    sourceHeight: 2,
    rotation,
    crop,
    width: crop.width,
    height: crop.height,
  });

  it('rotates clockwise by 90 degrees without resampling', () => {
    const out = transformFrame(plan(90), { format: 'I420', data: i420, layout, fullRange: false });
    expect(Array.from(out.subarray(0, 8))).toEqual([4, 0, 5, 1, 6, 2, 7, 3]);
    expect(Array.from(out.subarray(8))).toEqual([100, 101, 200, 201]);
  });

  it('reads interleaved NV12 chroma and crops in the rotated frame', () => {
    const nv12 = Uint8Array.from([...luma, 100, 200, 101, 201]);
    const out = transformFrame(plan(90, { x: 0, y: 2, width: 2, height: 2 }), {
      format: 'NV12',
      data: nv12,
      layout: [
        { offset: 0, stride: 4 },
        { offset: 8, stride: 4 },
      ],
      fullRange: false,
    });
    expect(Array.from(out.subarray(0, 4))).toEqual([6, 2, 7, 3]);
    expect(Array.from(out.subarray(4))).toEqual([101, 201]);
  });

  it('handles 0, 180 and 270 degrees', () => {
    const upright = { x: 0, y: 0, width: 4, height: 2 };
    const at = (rotation: FramePlan['rotation'], crop = upright) =>
      Array.from(
        transformFrame(plan(rotation, crop), {
          format: 'I420',
          data: i420,
          layout,
          fullRange: false,
        }).subarray(0, 8),
      );
    expect(at(0)).toEqual(luma);
    expect(at(180)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(at(270, { x: 0, y: 0, width: 2, height: 4 })).toEqual([3, 7, 2, 6, 1, 5, 0, 4]);
  });

  it('converts full-range samples to limited range', () => {
    const full = Uint8Array.from([0, 255, 128, 64, 0, 255, 128, 64, 0, 255, 128, 255]);
    const out = transformFrame(plan(0, { x: 0, y: 0, width: 4, height: 2 }), {
      format: 'I420',
      data: full,
      layout,
      fullRange: true,
    });
    expect(Array.from(out.subarray(0, 4))).toEqual([16, 235, 126, 71]);
    expect(Array.from(out.subarray(8))).toEqual([16, 240, 128, 240]);
  });

  it('resamples when the output is smaller than the crop', () => {
    const flat = new Uint8Array(4 * 4 + 2 * 2 * 2).fill(80);
    const out = transformFrame(
      {
        sourceWidth: 4,
        sourceHeight: 4,
        rotation: 0,
        crop: { x: 0, y: 0, width: 4, height: 4 },
        width: 2,
        height: 2,
      },
      {
        format: 'I420',
        data: flat,
        layout: [
          { offset: 0, stride: 4 },
          { offset: 16, stride: 2 },
          { offset: 20, stride: 2 },
        ],
        fullRange: false,
      },
    );
    expect(Array.from(out)).toEqual(new Array(6).fill(80));
  });
});

describe('colour tags', () => {
  it('prefers the container tags and falls back to the decoded frame', () => {
    expect(colourCodes({ primaries: 12, transfer: 1, matrix: 6 })).toEqual({
      primaries: 12,
      transfer: 1,
      matrix: 6,
    });
    expect(
      colourCodes(undefined, {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'rgb' as VideoMatrixCoefficients,
      }),
    ).toEqual({ primaries: 1, transfer: 1, matrix: 0 });
    expect(colourCodes(undefined, {})).toBeUndefined();
    expect(colourSpaceInit({ primaries: 12, transfer: 1, matrix: 6 })).toEqual({
      primaries: 'smpte432',
      transfer: 'bt709',
      matrix: 'smpte170m',
      fullRange: false,
    });
  });

  it('chooses an H.264 level that fits the frame', () => {
    expect(avcCodecs(1280, 720)[0]).toBe('avc1.64001f');
    expect(avcCodecs(1920, 1080)[0]).toBe('avc1.640029');
    expect(avcCodecs(1308, 1744)).toEqual(['avc1.640032', 'avc1.4d0032', 'avc1.420032']);
  });
});
