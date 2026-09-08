import { VipsImageEngine } from '../../packages/worker/src/vips/VipsImageEngine';
import {
  createCompatImageEngine,
  createImageProcessor,
  decodeImage,
  resizeImage,
  WorkerPool,
  getImageRuntimeCapabilities,
} from '../../packages/worker/src/index';
import type { CompressSettings } from '../../packages/codecs/src/index';
import { fixture } from '../performance/browser';

const engine = new VipsImageEngine();
const pool = new WorkerPool(1);
const compat = createCompatImageEngine(() => pool);
const processor = createImageProcessor(compat, engine);
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const asBase64 = async (buffer: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, hasAlpha: boolean) {
  check(a.length === b.length, 'Pixel lengths differ');
  let rgb = 0;
  let alpha = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    alpha += Math.abs(a[i + 3] - b[i + 3]);
    for (let c = 0; c < 3; c++) {
      // Compare both on black and white so hidden RGB cannot mask wrong alpha.
      const diff = hasAlpha
        ? Math.max(
            Math.abs((a[i + c] * a[i + 3]) / 255 - (b[i + c] * b[i + 3]) / 255),
            Math.abs(((255 - a[i + c]) * a[i + 3]) / 255 - ((255 - b[i + c]) * b[i + 3]) / 255),
          )
        : Math.abs(a[i + c] - b[i + c]);
      rgb += diff;
      max = Math.max(max, diff);
    }
  }
  return { rgbMAE: rgb / ((a.length / 4) * 3), alphaMAE: alpha / (a.length / 4), max };
}

async function verifyEngine(extra: { name: string; url: string }[] = []) {
  const cases = [];
  const sources: { name: string; source: Blob }[] = [];
  for (const mime of ['image/jpeg', 'image/png']) {
    sources.push({ name: mime.slice(6), source: await fixture(123, 81, mime, 'photo') });
  }
  sources.push({ name: 'alpha', source: await fixture(123, 81, 'image/png', 'alpha') });
  for (const orientation of [1, 3, 6, 8]) {
    sources.push({
      name: `orientation-${orientation}`,
      source: await fixture(120, 80, 'image/jpeg', 'orientation', orientation),
    });
  }
  for (const [name, width, height] of [
    ['tiny', 1, 1],
    ['wide', 999, 3],
    ['tall', 3, 999],
  ] as const) {
    sources.push({ name, source: await fixture(width, height, 'image/png', 'photo') });
  }
  for (const { name, url } of extra)
    sources.push({ name, source: await (await fetch(url)).blob() });
  const gallery = document.getElementById('gallery')!;
  for (const { name, source } of sources) {
    for (const outputFormat of ['mozjpeg', 'webp'] as const) {
      for (const mode of [
        'none',
        'contain',
        'cover',
        'stretch',
        'percentage',
        'contain-large',
      ] as const) {
        const settings: CompressSettings = {
          outputFormat,
          quality: outputFormat === 'mozjpeg' ? 75 : 85,
          advanced: {},
          resize: {
            enabled: mode !== 'none',
            mode: mode === 'percentage' ? 'percentage' : 'absolute',
            maxWidth: mode === 'contain-large' ? 2048 : 64,
            maxHeight: mode === 'contain-large' ? 2048 : 47,
            percentage: 53,
            method: mode === 'cover' || mode === 'stretch' ? mode : 'contain',
          },
        };
        const reference = await compat.process({ id: 'compat', source, settings });
        const result = await engine
          .process({ id: 'vips', source, settings })
          .catch((error: Error) => {
            throw new Error(`${name}/${outputFormat}/${mode}: ${error.message}`);
          });
        check(
          result.width === reference.width &&
            result.height === reference.height &&
            result.originalWidth === reference.originalWidth &&
            result.originalHeight === reference.originalHeight &&
            result.originalSize === source.size &&
            result.outputSize === result.buffer.byteLength,
          `Geometry/metadata mismatch: ${name}/${outputFormat}/${mode}: ${JSON.stringify(result)} vs ${JSON.stringify(reference)}`,
        );
        const decoded = await decodeImage(result.buffer);
        const referencePixels = await decodeImage(reference.buffer);
        const metrics = compare(decoded.data, referencePixels.data, outputFormat === 'webp');
        const sourcePixels = await decodeImage(await source.arrayBuffer());
        const canonical = resizeImage(
          sourcePixels.data,
          sourcePixels.width,
          sourcePixels.height,
          settings.resize!,
        );
        const sourceError = compare(decoded.data, canonical.data, outputFormat === 'webp');
        const compatSourceError = compare(
          referencePixels.data,
          canonical.data,
          outputFormat === 'webp',
        );
        check(
          metrics.rgbMAE < 12 && metrics.alphaMAE < 3,
          `Color/alpha mismatch: ${name}/${outputFormat}/${mode}: ${JSON.stringify({ metrics, sourceError, compatSourceError })}`,
        );
        // Metadata must be absent, including input EXIF orientation and embedded ICC.
        const text = new TextDecoder('latin1').decode(result.buffer);
        check(
          !text.includes('Exif\0\0') &&
            !text.includes('ICC_PROFILE') &&
            (outputFormat !== 'webp' ||
              (!text.includes('ICCP') && !text.includes('EXIF') && !text.includes('XMP '))),
          `Unexpected metadata: ${name}/${outputFormat}/${mode}`,
        );
        if (mode === 'none') {
          const row = document.createElement('section');
          const title = document.createElement('p');
          title.textContent = `${name} → ${outputFormat}: Compat / Vips`;
          row.append(title);
          for (const output of [reference, result]) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(new Blob([output.buffer]));
            row.append(img);
          }
          gallery.append(row);
        }
        cases.push({
          name,
          outputFormat,
          mode,
          width: result.width,
          height: result.height,
          originalWidth: result.originalWidth,
          originalHeight: result.originalHeight,
          ...metrics,
          sourceError,
          compatSourceError,
          bytes: result.buffer.byteLength,
        });
      }
    }
  }
  // Lossless WebP validates alpha and direction without lossy encoder noise.
  const alpha = await fixture(96, 64, 'image/png', 'alpha');
  const losslessSettings: CompressSettings = {
    outputFormat: 'webp',
    quality: 75,
    advanced: { lossless: 1, exact: 1 },
  };
  const lossless = await engine.process({
    id: 'lossless',
    source: alpha,
    settings: losslessSettings,
  });
  const actual = await decodeImage(lossless.buffer);
  const expected = await decodeImage(await alpha.arrayBuffer());
  const losslessMetrics = compare(actual.data, expected.data, true);
  check(
    losslessMetrics.rgbMAE < 1.1 && losslessMetrics.alphaMAE === 0,
    `Lossless alpha: ${JSON.stringify(losslessMetrics)}`,
  );
  // Compare to the canonical geometry directly, independent of both encoders.
  const canonical = resizeImage(expected.data, expected.width, expected.height, {
    enabled: true,
    mode: 'absolute',
    maxWidth: 47,
    maxHeight: 37,
    percentage: 50,
    method: 'cover',
  });
  const resized = await engine.process({
    id: 'lossless-cover',
    source: alpha,
    settings: {
      ...losslessSettings,
      resize: {
        enabled: true,
        mode: 'absolute',
        maxWidth: 47,
        maxHeight: 37,
        percentage: 50,
        method: 'cover',
      },
    },
  });
  const cropMetrics = compare((await decodeImage(resized.buffer)).data, canonical.data, true);
  check(
    cropMetrics.rgbMAE < 4 && cropMetrics.alphaMAE < 2,
    `Alpha crop: ${JSON.stringify(cropMetrics)}`,
  );
  return { cases, losslessMetrics, cropMetrics, sample: await asBase64(lossless.buffer) };
}

async function runOne(policy: 'vips' | 'compat' | 'auto' = 'auto') {
  const source = await fixture(120, 80, 'image/png', 'photo');
  return processor.process(
    { id: 'one', source, settings: { outputFormat: 'mozjpeg', quality: 75 } },
    undefined,
    policy,
  );
}
async function verifyOptions() {
  const source = await fixture(120, 80, 'image/png', 'photo');
  const jpegHeader = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    for (let at = 2; at + 12 < bytes.length;) {
      check(bytes[at] === 255, 'Invalid JPEG marker');
      const marker = bytes[at + 1];
      if (marker === 0xc0 || marker === 0xc2)
        return { progressive: marker === 0xc2, sampling: bytes[at + 11] };
      at += 2 + view.getUint16(at + 2);
    }
    throw Error('Missing JPEG frame header');
  };
  const cases = [];
  for (const quality of [0, 75, 95, 100]) {
    for (const progressive of [false, true]) {
      for (const chroma_subsample of [1, 2]) {
        const settings: CompressSettings = {
          outputFormat: 'mozjpeg',
          quality,
          advanced: { progressive, auto_subsample: false, chroma_subsample },
        };
        const result = await engine.process({ id: 'options', source, settings });
        const header = jpegHeader(result.buffer);
        check(
          header.progressive === progressive &&
            header.sampling === (chroma_subsample === 1 ? 0x11 : 0x22),
          `JPEG setting mismatch: ${JSON.stringify({ settings, header })}`,
        );
        cases.push({ quality, chroma_subsample, ...header, bytes: result.outputSize });
      }
    }
  }
  const mid = await processor.process({
    id: 'auto-422',
    source,
    settings: { outputFormat: 'mozjpeg', quality: 85 },
  });
  check(
    mid.engine === 'compat' && jpegHeader(mid.buffer).sampling === 0x21,
    'Automatic 4:2:2 must remain on Compat',
  );
  return cases;
}
Object.assign(window, {
  engine,
  processor,
  compat,
  VipsImageEngine,
  fixture,
  runOne,
  verifyEngine,
  verifyOptions,
  createImageProcessor,
  getImageRuntimeCapabilities,
  disposeEngines: () => {
    engine.dispose();
    pool.destroy();
  },
});
