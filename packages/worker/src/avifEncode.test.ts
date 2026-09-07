import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { AVIF_CHROMA_SUBSAMPLE } from '@pic-forge/codecs';
import type { CompressSettings } from '@pic-forge/codecs';
import { buildEncoderOptions } from './encoderOptions';

const avifRoot = fileURLToPath(new URL('../../codecs/node_modules/@jsquash/avif/', import.meta.url));
const avifEncDir = join(avifRoot, 'codec/enc');

const baseSettings: CompressSettings = {
  outputFormat: 'avif',
  quality: 75,
  resize: {
    enabled: false,
    mode: 'absolute',
    maxWidth: 1920,
    maxHeight: 1080,
    percentage: 50,
    method: 'contain',
  },
  advanced: {},
};

function makeColorImage(size = 64): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const left = x < size / 2;
      const top = y < size / 2;
      if (top && left) {
        data[i] = 220;
        data[i + 1] = 24;
        data[i + 2] = 32;
      } else if (top) {
        data[i] = 24;
        data[i + 1] = 200;
        data[i + 2] = 40;
      } else if (left) {
        data[i] = 32;
        data[i + 1] = 40;
        data[i + 2] = 220;
      } else {
        data[i] = 236;
        data[i + 1] = 220;
        data[i + 2] = 28;
      }
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

function chromaEnergy(r: number, g: number, b: number): number {
  return Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
}

function samplePixel(rgb: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 3;
  return { r: rgb[offset], g: rgb[offset + 1], b: rgb[offset + 2] };
}

function probePixFmt(path: string): string {
  const json = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,width,height', '-of', 'json', path],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(json) as { streams: Array<{ pix_fmt: string }> };
  return parsed.streams[0].pix_fmt;
}

async function decodeRgb(path: string, width: number, height: number): Promise<Buffer> {
  return execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    path,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ], { maxBuffer: width * height * 3 + 1024 });
}

describe('AVIF real WASM encode', () => {
  const image = makeColorImage(64);
  const outputDir = join(tmpdir(), 'picforge-avif-fix');

  afterAll(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it('encodes color 4:4:4 and 4:2:0 with worker-assembled quality 75', async () => {
    await mkdir(outputDir, { recursive: true });
    const wasmBytes = await readFile(join(avifEncDir, 'avif_enc.wasm'));
    const wasmModule = await WebAssembly.compile(wasmBytes);
    const encodeModule = await import(pathToFileURL(join(avifRoot, 'encode.js')).href) as {
      default: (data: { data: Uint8ClampedArray; width: number; height: number }, options: Record<string, unknown>) => Promise<ArrayBuffer>;
      init: (module: WebAssembly.Module) => Promise<unknown>;
    };
    await encodeModule.init(wasmModule);

    const options444 = buildEncoderOptions({
      ...baseSettings,
      quality: 75,
      advanced: { subsample: AVIF_CHROMA_SUBSAMPLE.YUV444, speed: 6 },
    });
    const options420 = buildEncoderOptions({
      ...baseSettings,
      quality: 75,
      advanced: { subsample: AVIF_CHROMA_SUBSAMPLE.YUV420, speed: 6 },
    });
    const options100 = buildEncoderOptions({
      ...baseSettings,
      quality: 100,
      advanced: { subsample: AVIF_CHROMA_SUBSAMPLE.YUV444, speed: 6 },
    });

    expect(options444.quality).toBe(75);
    expect(options420.quality).toBe(75);
    expect(options100.quality).toBe(100);
    expect(options444.subsample).toBe(3);
    expect(options420.subsample).toBe(1);

    const encoded444 = await encodeModule.default(image, options444);
    const encoded420 = await encodeModule.default(image, options420);
    const encoded100 = await encodeModule.default(image, options100);

    expect(encoded444.byteLength).toBeGreaterThan(200);
    expect(encoded420.byteLength).toBeGreaterThan(200);
    expect(encoded100.byteLength).toBeGreaterThan(encoded444.byteLength / 4);

    const path444 = join(outputDir, 'color-444.avif');
    const path420 = join(outputDir, 'color-420.avif');
    const path100 = join(outputDir, 'color-100.avif');
    await writeFile(path444, Buffer.from(encoded444));
    await writeFile(path420, Buffer.from(encoded420));
    await writeFile(path100, Buffer.from(encoded100));

    const pix444 = probePixFmt(path444);
    const pix420 = probePixFmt(path420);
    expect(pix444).toMatch(/yuv444|gbrp/);
    expect(pix420).toMatch(/yuv420/);
    expect(pix444).not.toMatch(/gray/);
    expect(pix420).not.toMatch(/gray/);

    const rgb444 = await decodeRgb(path444, 64, 64);
    const rgb420 = await decodeRgb(path420, 64, 64);
    expect(rgb444.byteLength).toBe(64 * 64 * 3);
    expect(rgb420.byteLength).toBe(64 * 64 * 3);

    const red444 = samplePixel(rgb444, 64, 16, 16);
    const green444 = samplePixel(rgb444, 64, 48, 16);
    const blue444 = samplePixel(rgb444, 64, 16, 48);
    expect(chromaEnergy(red444.r, red444.g, red444.b)).toBeGreaterThan(80);
    expect(red444.r).toBeGreaterThan(red444.g + 40);
    expect(green444.g).toBeGreaterThan(green444.r + 40);
    expect(blue444.b).toBeGreaterThan(blue444.r + 40);

    const red420 = samplePixel(rgb420, 64, 16, 16);
    expect(chromaEnergy(red420.r, red420.g, red420.b)).toBeGreaterThan(40);
    expect(red420.r).toBeGreaterThan(red420.g);

    await writeFile(
      join(outputDir, 'probe.json'),
      JSON.stringify(
        {
          outputDir,
          quality75: options444.quality,
          quality100: options100.quality,
          pix444,
          pix420,
          bytes444: encoded444.byteLength,
          bytes420: encoded420.byteLength,
          bytes100: encoded100.byteLength,
          red444,
        },
        null,
        2,
      ),
    );

    const written = await readFile(path444);
    expect(written.byteLength).toBe(encoded444.byteLength);
  }, 120_000);
});
