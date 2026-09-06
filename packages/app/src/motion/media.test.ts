import { cleanApertureFilters } from './cleanAperture';
import { describe, it, expect } from 'vitest';
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
