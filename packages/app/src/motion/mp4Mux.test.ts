import { describe, expect, it } from 'vitest';
import { aacFormat, parseMovie, videoTrackInfo } from './movDemux';
import { interleave, muxMp4, videoTiming, type MuxVideoTrack } from './mp4Mux';

// avcC: version 1, High profile, level 3.1, 4-byte lengths, one SPS and one PPS.
const AVCC = Uint8Array.of(
  1,
  0x64,
  0,
  0x1f,
  0xff,
  0xe1,
  0,
  4,
  0x67,
  0x64,
  0,
  0x1f,
  1,
  0,
  2,
  0x68,
  0xee,
);
// AudioSpecificConfig: AAC LC, 48 kHz, mono.
const ASC = Uint8Array.of(0x11, 0x88);

const sample = (pts: number, sync = false, fill = pts) => ({
  data: Uint8Array.from({ length: 5 + (pts % 7) }, () => fill & 255),
  pts,
  sync,
});

const video = (samples: MuxVideoTrack['samples'], lastDuration = 20): MuxVideoTrack => ({
  width: 64,
  height: 48,
  timescale: 600,
  description: AVCC,
  colour: { primaries: 12, transfer: 1, matrix: 6, fullRange: false },
  samples,
  lastDuration,
});

const buffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe('videoTiming', () => {
  it('needs no composition offsets without reordering', () => {
    const timing = videoTiming([0, 20, 40], 20);
    expect(timing).toMatchObject({
      composition: [0, 0, 0],
      durations: [20, 20, 20],
      delay: 0,
      start: 0,
    });
  });

  it('delays decode times just enough for reordered frames', () => {
    const timing = videoTiming([0, 60, 20, 40], 20);
    expect(timing.delay).toBe(20);
    expect(timing.composition).toEqual([20, 60, 0, 0]);
    expect(timing.durations).toEqual([20, 20, 20, 20]);
  });
});

describe('muxMp4', () => {
  it('round-trips reordered H.264 samples with exact presentation times and tags', () => {
    const samples = [sample(0, true), sample(60), sample(20), sample(40)];
    const mp4 = muxMp4(video(samples));
    const movie = parseMovie(buffer(mp4));
    const [track] = movie.tracks;
    expect(movie.timescale).toBe(600);
    expect(track).toMatchObject({ handler: 'vide', format: 'avc1', width: 64, height: 48 });
    expect(videoTrackInfo(track)).toMatchObject({
      codec: 'avc1.64001f',
      rotation: 0,
      colour: { primaries: 12, transfer: 1, matrix: 6, fullRange: false },
    });
    const table = track.samples();
    expect(Array.from(table.pts)).toEqual([0, 60, 20, 40]);
    expect(Array.from(table.sync)).toEqual([1, 0, 0, 0]);
    samples.forEach((entry, index) =>
      expect(mp4.subarray(table.offsets[index], table.offsets[index] + table.sizes[index])).toEqual(
        entry.data,
      ),
    );
    // moov precedes mdat (fast start).
    const types: string[] = [];
    for (let offset = 0; offset < mp4.length;) {
      const size = new DataView(mp4.buffer, mp4.byteOffset).getUint32(offset);
      types.push(String.fromCharCode(...mp4.subarray(offset + 4, offset + 8)));
      offset += size;
    }
    expect(types).toEqual(['ftyp', 'moov', 'mdat']);
  });

  it('keeps a late first frame with an empty edit', () => {
    const table = parseMovie(
      buffer(muxMp4(video([sample(30, true), sample(50)]))),
    ).tracks[0].samples();
    expect(Array.from(table.pts)).toEqual([30, 50]);
  });

  it('writes AAC with its configuration and priming edit', () => {
    const audio = {
      sampleRate: 48000,
      channels: 1,
      description: ASC,
      samples: [0, 1, 2].map((index) => ({ data: Uint8Array.of(index, 1, 2), duration: 1024 })),
      priming: 1024,
    };
    const movie = parseMovie(buffer(muxMp4(video([sample(0, true)]), audio)));
    const track = movie.tracks.find((entry) => entry.handler === 'soun')!;
    expect(aacFormat(track)).toEqual({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      channels: 1,
      description: ASC,
    });
    const table = track.samples();
    expect(table.count).toBe(3);
    expect(table.edit).toBe(-1024);
    expect(Array.from(table.durations)).toEqual([1024, 1024, 1024]);
  });
});

describe('interleave', () => {
  it('alternates tracks in runs of at most half a second', () => {
    const video = Array.from({ length: 36 }, (_, index) => index / 30);
    const audio = Array.from({ length: 57 }, (_, index) => (index * 1024) / 48000);
    const order = interleave([video, audio]);
    expect(order.slice(0, 4).map((entry) => entry.track)).toEqual([0, 1, 0, 1]);
    expect(order[0]).toEqual({ track: 0, first: 0, count: 15 });
    for (const track of [0, 1])
      expect(
        order
          .filter((entry) => entry.track === track)
          .reduce((total, entry) => total + entry.count, 0),
      ).toBe(track ? 57 : 36);
  });

  it('keeps every sample addressable when chunks alternate', () => {
    const frames = Array.from({ length: 40 }, (_, index) =>
      sample(index * 20, index % 15 === 0, index),
    );
    const audio = {
      sampleRate: 48000,
      channels: 1,
      description: ASC,
      samples: Array.from({ length: 70 }, (_, index) => ({
        data: Uint8Array.of(200, index, index),
        duration: 1024,
      })),
    };
    const mp4 = muxMp4(video(frames), audio);
    const movie = parseMovie(buffer(mp4));
    const [videoTable, audioTable] = movie.tracks.map((track) => track.samples());
    frames.forEach((entry, index) =>
      expect(
        mp4.subarray(
          videoTable.offsets[index],
          videoTable.offsets[index] + videoTable.sizes[index],
        ),
      ).toEqual(entry.data),
    );
    audio.samples.forEach((entry, index) =>
      expect(
        mp4.subarray(
          audioTable.offsets[index],
          audioTable.offsets[index] + audioTable.sizes[index],
        ),
      ).toEqual(entry.data),
    );
    // Audio is not left at the end of the file.
    expect(audioTable.offsets[0]).toBeLessThan(videoTable.offsets[39]);
  });
});
