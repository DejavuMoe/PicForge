import type Vips from 'wasm-vips';
import type { CompressSettings } from '@pic-forge/codecs';
import { calculateResizeGeometry } from '../imageProcessor';
import { ImageEngineError, type ImageProcessResult } from '../imageEngine';
import { mapVipsEncoderOptions } from './vipsOptions';

function inputError(message: string): never {
  throw new ImageEngineError(message, 'input');
}

function checkDimensions(width: number, height: number) {
  // A final Worker-side guard; the scheduler still applies stricter device limits.
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16_384 ||
    height > 16_384 ||
    width * height > 50_000_000
  ) {
    inputError('Image exceeds browser safety limit: Vips dimensions');
  }
}

/** Only ordinary JPEG, PNG and WebP. Do not let the generic loader expand scope. */
export function checkVipsInput(buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) inputError('Vips input exceeds 50 MiB');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return;
  const view = new DataView(buffer);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length >= 33 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      if (length > bytes.length - at - 12) inputError('Invalid PNG chunk');
      if (tag(at + 4) === 'acTL') inputError('Animated PNG uses compatibility');
      at += 12 + length;
    }
    return;
  }
  if (bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const length = view.getUint32(at + 4, true);
      if (length > bytes.length - at - 8) inputError('Invalid WebP chunk');
      if (
        tag(at) === 'ANIM' ||
        tag(at) === 'ANMF' ||
        (tag(at) === 'VP8X' && length > 0 && bytes[at + 8] & 2)
      ) {
        inputError('Animated WebP uses compatibility');
      }
      at += 8 + length + (length & 1);
    }
    return;
  }
  inputError('Unsupported Vips input');
}

/** Entire pixel pipeline stays inside libvips, with deterministic handle cleanup. */
export function processVipsImage(
  vips: typeof Vips,
  buffer: ArrayBuffer,
  settings: CompressSettings,
): ImageProcessResult {
  checkVipsInput(buffer);
  const encoder = mapVipsEncoderOptions(settings);
  if (!encoder) inputError('Vips cannot preserve these encoder settings');
  const images: Vips.Image[] = [];
  const own = (image: Vips.Image) => {
    images.push(image);
    return image;
  };
  try {
    let image = own(
      vips.Image.newFromBuffer(buffer, '', { access: 'sequential', fail_on: 'error' }),
    );
    checkDimensions(image.width, image.height);
    if (
      image.format !== 'uchar' ||
      !['srgb', 'rgb', 'b-w'].includes(image.interpretation) ||
      image.getTypeof('gainmap-data') ||
      (image.getTypeof('n-pages') && image.getInt('n-pages') > 1)
    ) {
      inputError('High bit-depth, CMYK, HDR or multipage images use compatibility');
    }
    image = own(image.autorot());
    const originalWidth = image.width;
    const originalHeight = image.height;
    // Canvas decodes into sRGB. Convert embedded profiles before resampling and strip
    // them on export; never retain GPS/EXIF or merely relabel wide-gamut pixels.
    image = own(
      image.getTypeof('icc-profile-data')
        ? image.iccTransform('srgb', { embedded: true, depth: 8, intent: 'relative' })
        : image.colourspace('srgb'),
    );
    const resize = settings.resize;
    if (resize?.enabled) {
      if (
        !['absolute', 'percentage'].includes(resize.mode) ||
        !['contain', 'cover', 'stretch'].includes(resize.method) ||
        ![resize.maxWidth, resize.maxHeight, resize.percentage].every(Number.isFinite) ||
        resize.maxWidth <= 0 ||
        resize.maxHeight <= 0 ||
        resize.percentage <= 0
      ) {
        inputError('Invalid resize settings');
      }
    }
    const geometry = resize?.enabled
      ? calculateResizeGeometry(
          originalWidth,
          originalHeight,
          resize.mode === 'percentage'
            ? Math.round((originalWidth * resize.percentage) / 100)
            : resize.maxWidth,
          resize.mode === 'percentage'
            ? Math.round((originalHeight * resize.percentage) / 100)
            : resize.maxHeight,
          resize.method,
        )
      : {
          targetWidth: originalWidth,
          targetHeight: originalHeight,
          sourceX: 0,
          sourceY: 0,
          sourceWidth: originalWidth,
          sourceHeight: originalHeight,
        };
    const { sourceX, sourceY, sourceWidth, sourceHeight, targetWidth, targetHeight } = geometry;
    checkDimensions(targetWidth, targetHeight);
    if (sourceX || sourceY || sourceWidth !== image.width || sourceHeight !== image.height) {
      image = own(image.crop(sourceX, sourceY, sourceWidth, sourceHeight));
    }
    const alpha = image.hasAlpha();
    // Like Canvas, resample premultiplied color to avoid transparent-edge halos.
    // The round trip also clears hidden RGB under fully transparent pixels.
    if (alpha) image = own(image.premultiply());
    if (image.width !== targetWidth || image.height !== targetHeight) {
      image = own(
        image.resize(targetWidth / image.width, {
          vscale: targetHeight / image.height,
          kernel: 'lanczos3',
        }),
      );
    }
    if (alpha) {
      image = own(image.unpremultiply());
      // Round restored floating-point channels before casting, rather than
      // introducing a systematic one-level loss in lossless WebP exports.
      image = own(image.round('rint'));
    }
    image = own(image.cast('uchar'));
    if (image.width !== targetWidth || image.height !== targetHeight) {
      throw new ImageEngineError('Vips geometry contract mismatch', 'runtime');
    }
    // jSquash JPEG consumes straight RGB and ignores alpha; do not introduce a
    // white/black matte that would darken partially transparent pixels.
    if (alpha && encoder.format === 'mozjpeg') image = own(image.extractBand(0, { n: 3 }));
    const encoded =
      encoder.format === 'mozjpeg'
        ? image.jpegsaveBuffer(encoder.options)
        : image.webpsaveBuffer(encoder.options);
    // Own bytes independent of WASM memory before transferring to the caller.
    const output = new Uint8Array(encoded).buffer;
    return {
      buffer: output,
      width: image.width,
      height: image.height,
      originalWidth,
      originalHeight,
      originalSize: buffer.byteLength,
      outputSize: output.byteLength,
      engine: 'vips',
    };
  } finally {
    for (let i = images.length - 1; i >= 0; i--) images[i].delete();
  }
}
