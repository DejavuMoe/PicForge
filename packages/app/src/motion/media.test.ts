import { cleanApertureFilters } from './cleanAperture';
import { describe, it, expect, vi } from 'vitest';
import { groupMedia, splitMotionPhoto, videoArguments, defaultMotionSettings } from './media';

const file = (name: string, webkitRelativePath = '') => ({ name, webkitRelativePath }) as File;

function createSyntheticMotionPhoto(padBytes = 0): Buffer {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftypmp42'),
    Buffer.alloc(8),
  ]);
  const moov = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x08]), Buffer.from('moov')]);
  const mdat = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x04, 0x08]),
    Buffer.from('mdat'),
    Buffer.alloc(1024, 0x42),
  ]);
  const mp4 = Buffer.concat([ftyp, moov, mdat]);
  const padding = padBytes > 0 ? Buffer.alloc(padBytes) : Buffer.alloc(0);
  return Buffer.concat([jpeg, mp4, padding]);
}

function makeBox(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + payload.length, 0);
  return Buffer.concat([size, Buffer.from(type), payload]);
}

function createSyntheticMovWithClap(): Buffer {
  const clapPayload = Buffer.alloc(32);
  clapPayload.writeUInt32BE(1744, 0);
  clapPayload.writeUInt32BE(1, 4);
  clapPayload.writeUInt32BE(1308, 8);
  clapPayload.writeUInt32BE(1, 12);
  clapPayload.writeInt32BE(0, 16);
  clapPayload.writeUInt32BE(1, 20);
  clapPayload.writeInt32BE(0, 24);
  clapPayload.writeUInt32BE(1, 28);
  const clapBox = makeBox('clap', clapPayload);

  const entryPrefix = Buffer.alloc(78);
  entryPrefix.writeUInt16BE(1920, 24);
  entryPrefix.writeUInt16BE(1440, 26);
  const entryBox = makeBox('avc1', Buffer.concat([entryPrefix, clapBox]));

  const stsdHeader = Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]);
  const stsdBox = makeBox('stsd', Buffer.concat([stsdHeader, entryBox]));
  const stblBox = makeBox('stbl', stsdBox);
  const minfBox = makeBox('minf', stblBox);

  const hdlrPayload = Buffer.alloc(12);
  hdlrPayload.write('vide', 8, 4, 'ascii');
  const hdlrBox = makeBox('hdlr', hdlrPayload);

  const mdiaBox = makeBox('mdia', Buffer.concat([hdlrBox, minfBox]));

  const tkhdPayload = Buffer.alloc(84);
  tkhdPayload.writeInt32BE(65536, 44);
  tkhdPayload.writeInt32BE(-65536, 52);
  const tkhdBox = makeBox('tkhd', tkhdPayload);

  const trakBox = makeBox('trak', Buffer.concat([tkhdBox, mdiaBox]));
  return makeBox('moov', trakBox);
}

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

  it('extracts Android motion photo with byte-identical reconstruction', async () => {
    const source = createSyntheticMotionPhoto();
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
    const source = createSyntheticMotionPhoto();
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
    // 1/4/7 bytes cannot form a box header; 8/16 are consumed as zero boxes during
    // the walk. Both paths must keep the tail in the exported video.
    for (const pad of [1, 4, 7, 8, 16, 100]) {
      const padded = createSyntheticMotionPhoto(pad);
      const { image, video } = splitMotionPhoto(new Uint8Array(padded).buffer);
      const reconstructed = Buffer.concat([
        Buffer.from(await image!.arrayBuffer()),
        Buffer.from(await video!.arrayBuffer()),
      ]);
      expect(reconstructed.equals(padded)).toBe(true);
    }
  });

  it('rejects non-zero tails, over-long padding and truncated video', () => {
    const source = createSyntheticMotionPhoto();
    // 4-byte non-zero tail: too short for the box walk, fails the zero-tail check.
    const nonzeroTail = Buffer.concat([source, Buffer.from([0, 0, 0, 1])]);
    expect(() => splitMotionPhoto(new Uint8Array(nonzeroTail).buffer)).toThrow('invalidMotion');
    // 4097 zero bytes: the walk stops at the explicit zero marker and the tail
    // exceeds MAX_TRAILING_PADDING.
    const longPad = createSyntheticMotionPhoto(4097);
    expect(() => splitMotionPhoto(new Uint8Array(longPad).buffer)).toThrow('invalidMotion');
    // Truncated into the final box: the walk cannot reach EOF and the
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

it('applies the iOS clean aperture in its autorotated frame', () => {
  const source = createSyntheticMovWithClap();
  const aperture = cleanApertureFilters(new Uint8Array(source).buffer);
  expect(aperture).toEqual(['crop=1308:1744:66:88']);
  expect(videoArguments(defaultMotionSettings, aperture)).not.toContain('-noautorotate');
  source.writeUInt32BE(0, source.indexOf(Buffer.from('clap')) + 8);
  expect(() => cleanApertureFilters(new Uint8Array(source).buffer)).toThrow('videoFailed');
});
