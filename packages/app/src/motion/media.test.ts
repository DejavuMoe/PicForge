import { cleanApertureFilters } from './cleanAperture';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupMedia, splitMotionPhoto, videoArguments, defaultMotionSettings } from './media';
const file = (name: string, webkitRelativePath = '') => ({ name, webkitRelativePath }) as File;
describe('motion tools', () => {
  it('pairs case-insensitively without guessing missing or ambiguous partners', () => {
    const items = groupMedia(
      [file('IMG.HEIC'), file('img.mov'), file('still.heic'), file('lone.MOV')],
      false,
    );
    expect(items).toHaveLength(3);
    expect(items[0].image?.name).toBe('IMG.HEIC');
    expect(items[0].video?.name).toBe('img.mov');
    expect(items[1].video).toBeUndefined();
    expect(items[2].image).toBeUndefined();
    expect(groupMedia([file('x.heic'), file('x.jpg')], false)[0].issue).toBe('ambiguous');
    expect(groupMedia([file('x.heic', 'a/x.heic'), file('x.mov', 'b/x.mov')], false)).toHaveLength(
      2,
    );
  });
  it('extracts the real Android sample with byte-identical reconstruction', async () => {
    const source = readFileSync(
      new URL('../../../../sample/Android/IMG20260711013006.jpg', import.meta.url),
    );
    const buffer = new Uint8Array(source).buffer;
    const { image, video } = splitMotionPhoto(buffer);
    expect(image?.type).toBe('image/jpeg');
    expect(video?.type).toBe('video/mp4');
    const reconstructed = Buffer.concat([
      Buffer.from(await image!.arrayBuffer()),
      Buffer.from(await video!.arrayBuffer()),
    ]);
    expect(reconstructed.equals(source)).toBe(true);
    expect(video!.size).toBeGreaterThan(1000);
  });
  it('uses source slices without copying the exported Android bytes', async () => {
    const source = readFileSync(
      new URL('../../../../sample/Android/IMG20260711013006.jpg', import.meta.url),
    );
    const buffer = new Uint8Array(source).buffer;
    const blob = new Blob([buffer]);
    const slice = vi.spyOn(blob, 'slice');
    const output = splitMotionPhoto(buffer, blob);
    expect(slice).toHaveBeenCalledTimes(2);
    expect(output.image).toBe(slice.mock.results[0].value);
    expect(output.video).toBe(slice.mock.results[1].value);
    expect(
      Buffer.concat([
        Buffer.from(await output.image!.arrayBuffer()),
        Buffer.from(await output.video!.arrayBuffer()),
      ]).equals(source),
    ).toBe(true);
  });
  it('preserves legal zero padding byte-exactly, including box-header boundaries', async () => {
    const source = readFileSync(
      new URL('../../../../sample/Android/IMG20260711013006.jpg', import.meta.url),
    );
    // 1/4/7 bytes cannot form a box header; 8/16 are consumed as zero boxes during
    // the walk. Both paths must keep the tail in the exported video.
    for (const pad of [1, 4, 7, 8, 16, 100]) {
      const padded = Buffer.concat([source, Buffer.alloc(pad)]);
      const { image, video } = splitMotionPhoto(new Uint8Array(padded).buffer);
      const reconstructed = Buffer.concat([
        Buffer.from(await image!.arrayBuffer()),
        Buffer.from(await video!.arrayBuffer()),
      ]);
      expect(reconstructed.equals(padded)).toBe(true);
    }
  });
  it('rejects non-zero tails, over-long padding and truncated video', () => {
    const source = readFileSync(
      new URL('../../../../sample/Android/IMG20260711013006.jpg', import.meta.url),
    );
    // 4-byte non-zero tail: too short for the box walk, fails the zero-tail check.
    const nonzeroTail = Buffer.concat([source, Buffer.from([0, 0, 0, 1])]);
    expect(() => splitMotionPhoto(new Uint8Array(nonzeroTail).buffer)).toThrow('invalidMotion');
    // 4097 zero bytes: the walk stops at the explicit zero marker and the tail
    // exceeds MAX_TRAILING_PADDING.
    const longPad = Buffer.concat([source, Buffer.alloc(4097)]);
    expect(() => splitMotionPhoto(new Uint8Array(longPad).buffer)).toThrow('invalidMotion');
    // Truncated 100 bytes into the final box: the walk cannot reach EOF and the
    // remaining tail is non-zero.
    const truncated = source.subarray(0, source.length - 100);
    expect(() => splitMotionPhoto(new Uint8Array(truncated).buffer)).toThrow('invalidMotion');
  });
  it('rejects bogus signatures and preserves source timing explicitly', () => {
    expect(() =>
      splitMotionPhoto(
        new Uint8Array([255, 216, 0, 0, 0, 16, 102, 116, 121, 112, 0, 0, 0, 0, 0, 0]).buffer,
      ),
    ).toThrow();
    const args = videoArguments(defaultMotionSettings);
    expect(args).toContain('0:v:0');
    expect(args).toContain('passthrough');
    expect(args).not.toContain('-r');
    expect(videoArguments({ ...defaultMotionSettings, fps: '30', audio: false })).toContain('-an');
    expect(videoArguments({ ...defaultMotionSettings, fps: '30' }).join(' ')).toContain('fps=30');
  });
});

it('applies the iOS sample clean aperture in its autorotated frame', () => {
  const source = readFileSync(new URL('../../../../sample/iOS/IMG_4238.MOV', import.meta.url));
  const aperture = cleanApertureFilters(new Uint8Array(source).buffer);
  expect(aperture).toEqual(['crop=1308:1744:66:88']);
  expect(videoArguments(defaultMotionSettings, aperture)).not.toContain('-noautorotate');
  source.writeUInt32BE(0, source.indexOf(Buffer.from('clap')) + 8);
  expect(() => cleanApertureFilters(new Uint8Array(source).buffer)).toThrow('videoFailed');
});
