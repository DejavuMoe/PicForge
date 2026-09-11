import { normalizeApngPoster } from './apng';
import { describe, it, expect, vi } from 'vitest';
import { parseAnimation, inspectAnimation, finishWebpTimeline } from './metadata';
import { createImageProcessor, type ImageEngine } from '../imageEngine';

function gif(delays = [7, 13, 24], repeats = 2) {
  const head = Buffer.from('47494638396101000100800000000000ffffff', 'hex');
  const loop = Buffer.from('21ff0b4e45545343415045322e300301000000', 'hex');
  loop.writeUInt16LE(repeats, 16);
  const frames = delays.map((delay) => {
    const f = Buffer.from('21f90400000000002c0000000001000100000202440100', 'hex');
    f.writeUInt16LE(delay, 4);
    return f;
  });
  return new Uint8Array(Buffer.concat([head, loop, ...frames, Buffer.from([0x3b])]));
}
function chunk(name: string, data: Buffer) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(name, 4);
  data.copy(b, 8);
  let crc = 0xffffffff;
  for (const byte of b.subarray(4, b.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  b.writeUInt32BE((crc ^ 0xffffffff) >>> 0, b.length - 4);
  return b;
}
function png(delays: number[], denominator = 1000, poster = false) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(delays.length);
  actl.writeUInt32BE(3, 4);
  let sequence = 0;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', ihdr),
      chunk('acTL', actl),
      ...(poster ? [chunk('IDAT', Buffer.alloc(5))] : []),
      ...delays.flatMap((delay, i) => {
        const fc = Buffer.alloc(26);
        fc.writeUInt32BE(sequence++);
        fc.writeUInt32BE(2, 4);
        fc.writeUInt32BE(2, 8);
        fc.writeUInt16BE(delay, 20);
        fc.writeUInt16BE(denominator, 22);
        const fd = Buffer.alloc(5);
        fd.writeUInt32BE(i || poster ? sequence++ : 0);
        return [chunk('fcTL', fc), chunk(i || poster ? 'fdAT' : 'IDAT', fd)];
      }),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
// Small synthetic RIFF fixture; only container structure is used by these unit checks.
function webp(delays: number[]) {
  const frames = delays.map((delay) => {
    const b = Buffer.alloc(24);
    b.write('ANMF');
    b.writeUInt32LE(16, 4);
    b.writeUIntLE(delay, 20, 3);
    return b;
  });
  const head = Buffer.alloc(44);
  head.write('RIFF');
  head.writeUInt32LE(36 + frames.length * 24, 4);
  head.write('WEBPVP8X', 8);
  head.writeUInt32LE(10, 16);
  head[20] = 2;
  head.write('ANIM', 30);
  head.writeUInt32LE(6, 34);
  head.writeUInt16LE(3, 42);
  return new Uint8Array(Buffer.concat([head, ...frames]));
}

describe('animation container contract', () => {
  it('reads source timing and converts GIF repetitions to total plays', () => {
    expect(parseAnimation(gif())).toMatchObject({ format: 'gif', ends: [70, 200, 440], plays: 3 });
    expect(parseAnimation(gif([0, 1], 0))).toMatchObject({ ends: [100, 110], plays: 0 });
    expect(parseAnimation(gif([10]))).toBeNull();
    expect(parseAnimation(png([70, 130, 240]))).toMatchObject({
      format: 'apng',
      ends: [70, 200, 440],
      plays: 3,
    });
    expect(parseAnimation(png([1, 1, 1], 60))?.ends).toEqual([17, 33, 50]);
    expect(parseAnimation(png([1, 2], 0))?.ends).toEqual([10, 30]);
    expect(parseAnimation(png([0, 2], 1000))?.ends).toEqual([100, 102]);
  });
  it('rejects truncation, invalid sequences, impossible timing and excessive work', () => {
    expect(() => parseAnimation(gif().slice(0, -2))).toThrow('Animation: invalid');
    expect(() => parseAnimation(png([1, 1], 65535))).toThrow('Animation: timing');
    expect(() => parseAnimation(gif(Array(2001).fill(1)))).toThrow('Animation: limit');
    const bad = png([10, 10]);
    bad[61] = 8;
    expect(() => parseAnimation(bad)).toThrow('Animation: invalid');
    const big = gif();
    big[6] = 255;
    big[7] = 255;
    expect(() => parseAnimation(big)).toThrow('Animation: limit');
  });
  it('repairs only the final estimated duration and rejects shifted intermediate frames', () => {
    const meta = parseAnimation(gif())!;
    const fixed = finishWebpTimeline(webp([70, 130, 100]), meta);
    expect(parseAnimation(fixed)?.ends).toEqual([70, 200, 440]);
    expect(parseAnimation(finishWebpTimeline(webp([200, 100]), meta))?.ends).toEqual([200, 440]);
    expect(() => finishWebpTimeline(webp([86, 130, 100]), meta)).toThrow('Animation: timing');
  });
  it('wraps collapsed identical frames without losing duration or finite plays', () => {
    const b = Buffer.alloc(26);
    b.write('RIFF');
    b.writeUInt32LE(18, 4);
    b.write('WEBPVP8L', 8);
    b.writeUInt32LE(5, 16);
    b[20] = 0x2f;
    expect(parseAnimation(finishWebpTimeline(b, parseAnimation(gif())!))).toMatchObject({
      ends: [440],
      plays: 3,
    });
  });
  it('normalizes a separate APNG poster into a disposable setup frame without changing source bytes', () => {
    const source = png([70, 130, 240], 1000, true);
    const before = source.slice();
    expect(parseAnimation(source)?.poster).toBe(true);
    const normalized = normalizeApngPoster(source);
    expect(parseAnimation(normalized)).toMatchObject({ ends: [1, 71, 201, 441], plays: 3 });
    expect(parseAnimation(normalized)?.poster).toBeUndefined();
    expect(source).toEqual(before);
    source[32] ^= 1;
    expect(() => normalizeApngPoster(source)).toThrow('Animation: invalid');
  });

  it('caches metadata for the original Blob, including rejected inspections', async () => {
    const source = new Blob([gif()]);
    const first = inspectAnimation(source);
    expect(inspectAnimation(source)).toBe(first);
    expect((await first)?.ends).toEqual([70, 200, 440]);
  });
  it('never routes animation failures to a static engine, even under compat policy', async () => {
    const compat = { kind: 'compat', supports: () => true, process: vi.fn() } as ImageEngine;
    const animated = {
      kind: 'animation',
      supports: () => true,
      process: vi.fn().mockRejectedValue(new Error('decode failed')),
    } as ImageEngine;
    const request = {
      id: 'animation',
      source: new Blob([gif()]),
      settings: { outputFormat: 'webp' as const, quality: 75 },
    };
    await expect(
      createImageProcessor(compat, undefined, animated).process(request, undefined, 'compat'),
    ).rejects.toThrow('decode failed');
    await expect(createImageProcessor(compat).process(request)).rejects.toThrow(
      'Animation: unsupported',
    );
    expect(compat.process).not.toHaveBeenCalled();
  });
});
