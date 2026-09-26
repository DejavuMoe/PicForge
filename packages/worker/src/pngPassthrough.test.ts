import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CompressSettings } from '@pic-forge/codecs';
import { buildEncoderOptions } from './encoderOptions';
import { createCompatImageEngine } from './compatImageEngine';
import { preparePngPassthrough, readPngPassthrough } from './pngPassthrough';
import type { WorkerPool } from './workerPool';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer = Buffer.alloc(0)): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Non-interlaced PNG from channel samples (8- or 16-bit), filter 0 rows. */
function encodePng(
  width: number,
  height: number,
  colorType: 0 | 2 | 4 | 6,
  depth: 8 | 16,
  samples: number[],
  extra: Buffer[] = [],
) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  const perRow = width * CHANNELS[colorType];
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (const value of samples.slice(y * perRow, (y + 1) * perRow)) {
      if (depth === 16) rows.push(value >> 8, value & 255);
      else rows.push(value);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND'),
  ]);
}
function chunkTypes(png: Uint8Array): string[] {
  const bytes = Buffer.from(png);
  const types: string[] = [];
  for (let at = 8; at < bytes.length; at += 12 + bytes.readUInt32BE(at)) {
    types.push(bytes.toString('latin1', at + 4, at + 8));
  }
  return types;
}
/** Decode a non-interlaced grey/truecolour PNG (8/16-bit) to channel samples. */
function decodeSamples(png: Uint8Array): { depth: number; colorType: number; samples: number[] } {
  const bytes = Buffer.from(png);
  let ihdr = Buffer.alloc(0);
  const idat: Buffer[] = [];
  for (let at = 8; at < bytes.length; at += 12 + bytes.readUInt32BE(at)) {
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + bytes.readUInt32BE(at));
    if (type === 'IHDR') ihdr = body;
    if (type === 'IDAT') idat.push(body);
  }
  const [width, height, depth, colorType] = [ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]];
  expect(ihdr[12]).toBe(0);
  const bpp = CHANNELS[colorType] * (depth / 8);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let value = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = value & 255;
    }
  }
  const samples: number[] = [];
  for (let i = 0; i < px.length; i += depth / 8) samples.push(depth === 16 ? (px[i] << 8) | px[i + 1] : px[i]);
  return { depth, colorType, samples };
}

const pngSettings: CompressSettings = { outputFormat: 'oxipng', quality: 100, advanced: {} };
const metadata = [
  chunk('tEXt', Buffer.from('Author\0secret', 'latin1')),
  chunk('tIME', Buffer.alloc(7)),
  chunk('pHYs', Buffer.alloc(9)),
  chunk('sRGB', Buffer.from([0])),
];
const rgb8 = [10, 200, 30, 200, 100, 50, 123, 45, 67, 1, 2, 3];
// 16-bit samples whose low bytes differ from their high bytes: an 8-bit Canvas round trip would lose them.
const rgb16 = [0x1234, 0xfedc, 0x0102, 0x8001, 0x7ffe, 0x00ff, 0xabcd, 0x1111, 0x2222, 0x0001, 0xffff, 0x8000];

describe('PNG passthrough preparation', () => {
  it('copies only image-defining chunks of opaque PNGs', () => {
    const prepared = preparePngPassthrough(encodePng(2, 2, 2, 8, rgb8, metadata));
    expect(prepared).toMatchObject({ width: 2, height: 2 });
    expect(chunkTypes(new Uint8Array(prepared!.png))).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('leaves transparent PNGs to the Canvas path, which clears hidden colours', () => {
    expect(preparePngPassthrough(encodePng(1, 1, 6, 8, [1, 2, 3, 0]))).toBeNull();
    expect(preparePngPassthrough(encodePng(1, 1, 4, 8, [1, 0]))).toBeNull();
    expect(
      preparePngPassthrough(encodePng(1, 1, 2, 8, [1, 2, 3], [chunk('tRNS', Buffer.alloc(6))])),
    ).toBeNull();
  });

  it('leaves colour-managed, oriented, animated or unusual files to the Canvas path', () => {
    for (const extra of [
      chunk('iCCP', Buffer.from('p\0\0', 'latin1')),
      chunk('cICP', Buffer.from([1, 13, 0, 1])),
      chunk('eXIf', Buffer.from('MM\0*', 'latin1')),
      chunk('acTL', Buffer.alloc(8)),
      chunk('gAMA', Buffer.from([0, 0, 0xb1, 0x8f])),
      chunk('ABCD', Buffer.alloc(1)),
    ]) {
      expect(preparePngPassthrough(encodePng(1, 1, 2, 8, [1, 2, 3], [extra]))).toBeNull();
    }
    // gAMA alongside sRGB renders as sRGB.
    expect(
      preparePngPassthrough(
        encodePng(1, 1, 2, 8, [1, 2, 3], [chunk('sRGB', Buffer.from([0])), chunk('gAMA', Buffer.alloc(4))]),
      ),
    ).not.toBeNull();
  });

  it('rejects truncated or non-PNG input', () => {
    const png = encodePng(1, 1, 2, 8, [1, 2, 3]);
    expect(preparePngPassthrough(png.subarray(0, png.length - 12))).toBeNull();
    expect(preparePngPassthrough(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('reads only the signature of non-PNG Blobs', async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3])]);
    const arrayBuffer = vi.spyOn(blob, 'arrayBuffer');
    expect(await readPngPassthrough(blob)).toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe('PNG passthrough through the real OxiPNG WASM', () => {
  let optimise: (data: ArrayBuffer, options: Record<string, unknown>) => Promise<ArrayBuffer>;

  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../codecs/node_modules/@jsquash/oxipng/', import.meta.url));
    const module = (await import(pathToFileURL(`${root}optimise.js`).href)) as {
      init: (module: WebAssembly.Module) => Promise<unknown>;
      default: typeof optimise;
    };
    await module.init(await WebAssembly.compile(await readFile(`${root}codec/pkg/squoosh_oxipng_bg.wasm`)));
    optimise = module.default;
  });

  function engineWithRealOxipng() {
    const pool = {
      enqueue: vi.fn(
        async (
          id: string,
          buffer: ArrayBuffer,
          _w: number,
          _h: number,
          _size: number,
          settings: CompressSettings,
          callbacks: { onResult?: (id: string, output: ArrayBuffer) => void },
          options: { input?: string },
        ) => {
          expect(options.input).toBe('png');
          const encoderOptions = buildEncoderOptions(settings);
          const output = await optimise(buffer, {
            level: encoderOptions.level,
            interlace: encoderOptions.interlace,
            optimiseAlpha: encoderOptions.optimizeAlpha,
          });
          callbacks.onResult?.(id, output);
        },
      ),
    } as unknown as WorkerPool;
    const decodeAndResizeImage = vi.fn();
    return { engine: createCompatImageEngine(() => pool, { decodeAndResizeImage }), decodeAndResizeImage };
  }

  it.each([
    ['8-bit', 8 as const, rgb8],
    ['16-bit', 16 as const, rgb16],
  ])('exports exact %s samples without metadata or a Canvas decode', async (_label, depth, samples) => {
    const { engine, decodeAndResizeImage } = engineWithRealOxipng();
    const source = encodePng(2, 2, 2, depth, samples, metadata);
    const result = await engine.process({ id: 'png', source: new Blob([source]), settings: pngSettings });

    expect(decodeAndResizeImage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ width: 2, height: 2, originalWidth: 2, originalHeight: 2 });
    const output = new Uint8Array(result.buffer);
    expect(chunkTypes(output)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const decoded = decodeSamples(output);
    expect(decoded.depth).toBe(depth);
    expect(decoded.samples).toEqual(samples);
  });

  it('falls back to the Canvas path once when OxiPNG rejects the passthrough', async () => {
    const inputs: string[] = [];
    const pool = {
      enqueue: vi.fn(
        (
          id: string,
          _buffer: ArrayBuffer,
          _w: number,
          _h: number,
          _size: number,
          _settings: CompressSettings,
          callbacks: { onResult?: (id: string, output: ArrayBuffer) => void; onError?: (id: string, error: string) => void },
          options: { input?: string },
        ) => {
          inputs.push(options.input ?? 'rgba');
          if (options.input === 'png') callbacks.onError?.(id, 'CRC error');
          else callbacks.onResult?.(id, new ArrayBuffer(3));
        },
      ),
    } as unknown as WorkerPool;
    const decodeAndResizeImage = vi.fn(async () => ({
      data: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
      originalWidth: 2,
      originalHeight: 2,
    }));
    const engine = createCompatImageEngine(() => pool, { decodeAndResizeImage });
    const result = await engine.process({
      id: 'crc',
      source: new Blob([encodePng(2, 2, 2, 8, rgb8)]),
      settings: pngSettings,
    });
    expect(inputs).toEqual(['png', 'rgba']);
    expect(decodeAndResizeImage).toHaveBeenCalledTimes(1);
    expect(result.outputSize).toBe(3);
  });

  it('does not fall back after a passthrough timeout', async () => {
    const pool = {
      enqueue: vi.fn((id: string, _b, _w, _h, _s, _settings, callbacks: { onError?: (id: string, e: string) => void }) =>
        callbacks.onError?.(id, 'Task timed out after 60s'),
      ),
    } as unknown as WorkerPool;
    const decodeAndResizeImage = vi.fn();
    const engine = createCompatImageEngine(() => pool, { decodeAndResizeImage });
    await expect(
      engine.process({ id: 't', source: new Blob([encodePng(2, 2, 2, 8, rgb8)]), settings: pngSettings }),
    ).rejects.toThrow('Task timed out after 60s');
    expect(decodeAndResizeImage).not.toHaveBeenCalled();
  });

  it('uses the Canvas path for transparent PNGs and when resizing', async () => {
    const pool = { enqueue: vi.fn() } as unknown as WorkerPool;
    const decodeAndResizeImage = vi.fn(async () => {
      throw new Error('canvas path');
    });
    const engine = createCompatImageEngine(() => pool, { decodeAndResizeImage });
    await expect(
      engine.process({
        id: 'alpha',
        source: new Blob([encodePng(1, 1, 6, 8, [1, 2, 3, 0])]),
        settings: pngSettings,
      }),
    ).rejects.toThrow('canvas path');
    await expect(
      engine.process({
        id: 'resize',
        source: new Blob([encodePng(2, 2, 2, 8, rgb8)]),
        settings: {
          ...pngSettings,
          resize: { enabled: true, mode: 'percentage', maxWidth: 1, maxHeight: 1, percentage: 50, method: 'contain' },
        },
      }),
    ).rejects.toThrow('canvas path');
  });
});
