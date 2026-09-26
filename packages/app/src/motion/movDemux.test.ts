import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanApertureFilters } from './cleanAperture';
import { aacFormat, parseMovie, readBoxes, videoTrackInfo, UNSUPPORTED_MOVIE } from './movDemux';
import { planFrames } from './videoFrames';

const source = readFileSync(new URL('../../../../sample/ios/IMG_1539.MOV', import.meta.url));
const movieBuffer = () =>
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);

describe('parseMovie on the approved iOS Live Photo', () => {
  it('finds the main HEVC track before auxiliary video, audio and metadata', () => {
    const movie = parseMovie(movieBuffer());
    expect(movie.timescale).toBe(600);
    expect(movie.tracks.map((track) => track.handler)).toEqual([
      'vide',
      ...Array(5).fill('auxv'),
      'soun',
      ...Array(4).fill('meta'),
    ]);
    const track = movie.tracks[0];
    expect([track.width, track.height, track.timescale]).toEqual([1920, 1440, 600]);
    expect(videoTrackInfo(track)).toMatchObject({
      codec: 'hvc1.1.6.L150.B0',
      bitDepth: 8,
      rotation: 90,
      colour: { primaries: 12, transfer: 1, matrix: 6 },
      clap: { width: 1744, height: 1308, horizontal: 0, vertical: 0 },
    });
  });

  it('reports the presentation times FFmpeg reports, including signed B-frame offsets', () => {
    const table = parseMovie(movieBuffer()).tracks[0].samples();
    expect(table.count).toBe(75);
    // ffprobe: 0, 0.133333, 0.066667, 0.033333, 0.1 … in decode order.
    expect(Array.from(table.pts.slice(0, 5))).toEqual([0, 80, 40, 20, 60]);
    expect(new Set(table.pts).size).toBe(75);
    expect(Math.max(...table.pts)).toBe(1740);
    expect(table.end).toBe(1759);
    expect(table.sync[0]).toBe(1);
    expect(table.sync.reduce((total, value) => total + value, 0)).toBe(8);
    // Samples point at their bytes inside mdat.
    expect(table.offsets[0] + table.sizes[0]).toBeLessThanOrEqual(source.length);
    expect(table.offsets[1]).toBeGreaterThan(table.offsets[0]);
  });

  it('crops and rotates exactly like the FFmpeg clean-aperture adapter', () => {
    const track = parseMovie(movieBuffer()).tracks[0];
    const plan = planFrames(videoTrackInfo(track), track.width, track.height, 1920);
    const { crop } = plan;
    expect(cleanApertureFilters(movieBuffer())).toEqual([
      `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    ]);
    expect([plan.width, plan.height]).toEqual([1308, 1744]);
  });

  it('finds the PCM sound track, which the FFmpeg helper encodes to AAC', () => {
    const audio = parseMovie(movieBuffer()).tracks.find((track) => track.handler === 'soun')!;
    expect(audio.format).toBe('lpcm');
    expect(aacFormat(audio)).toBeUndefined();
    expect(audio.samples().count).toBe(141067);
  });

  it('rejects malformed boxes instead of guessing', () => {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 64); // size beyond the buffer
    bytes.set([0x6d, 0x6f, 0x6f, 0x76], 4);
    expect(() => readBoxes(new DataView(bytes.buffer), 0, 16)).toThrow(UNSUPPORTED_MOVIE);
    expect(() => parseMovie(new ArrayBuffer(8))).toThrow(UNSUPPORTED_MOVIE);
  });
});
