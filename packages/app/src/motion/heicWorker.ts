import { applyColorPlan, planColorConversion } from './colorProfile';
import type { HeifColor } from './heif';

/**
 * Decode the primary HEIC image to sRGB RGBA. Encoding happens in a separate
 * Worker: this one is terminated as soon as the pixels are transferred, so the
 * decoder's memory (libheif's WASM heap: compressed input, decoded planes and
 * RGBA) is released before MozJPEG allocates its own copy.
 *
 * When the caller passes the expected display size, the browser's own decoder
 * (Safari: ImageIO) is tried first and drawn into an sRGB canvas, which also
 * converts its colours. It is accepted only at exactly that size; any failure
 * or mismatch (no HEIC support, thumbnail, missing rotation or crop) decodes
 * with libheif instead.
 */

interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    callback: (value: { data: Uint8ClampedArray } | null) => void,
  ): void;
  free(): void;
}

export type HeicDecoder = 'native' | 'libheif';
export type HeicWorkerRequest = {
  buffer: ArrayBuffer;
  color?: HeifColor;
  /** Display size of the primary image; set only when a browser decode is acceptable. */
  native?: { width: number; height: number };
};
export type HeicWorkerResponse =
  | {
      rgba: ArrayBuffer;
      width: number;
      height: number;
      icc?: Uint8Array;
      decoder: HeicDecoder;
      /** Why the browser decode was not used, when it was tried. */
      nativeError?: string;
    }
  | { error: string };

async function decodeNatively(buffer: ArrayBuffer, expected: { width: number; height: number }) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
    throw new Error('unavailable');
  const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/heic' }));
  try {
    const { width, height } = bitmap;
    if (width !== expected.width || height !== expected.height)
      throw new Error(`size ${width}x${height}`);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = context.getImageData(0, 0, width, height, { colorSpace: 'srgb' }).data;
    canvas.width = canvas.height = 0;
    return { rgba, width, height };
  } finally {
    bitmap.close();
  }
}

async function decodeWithLibheif(buffer: ArrayBuffer, color: HeifColor | undefined) {
  const url = new URL('/wasm/heif-1.23.4-de265-1.1.1/libheif.mjs', self.location.origin).href;
  const { default: createHeif } = await import(/* @vite-ignore */ url);
  const heif = await createHeif();
  // Check the compiled library before any untrusted bytes reach its parser.
  if (heif.heif_get_version() !== '1.23.4' || heif._de265_get_version_number?.() !== 0x01010100)
    throw new Error('engineFailed');
  const images: HeifImage[] = new heif.HeifDecoder().decode(new Uint8Array(buffer));
  try {
    const primary = images.find((image) => image.is_primary()) ?? images[0];
    if (!primary) throw new Error('invalidHeic');
    const width = primary.get_width();
    const height = primary.get_height();
    if (width <= 0 || height <= 0 || width * height > 50_000_000) throw new Error('tooManyPixels');
    const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      primary.display(
        { data: new Uint8ClampedArray(width * height * 4), width, height },
        (value) => {
          if (value) resolve(value.data);
          else reject(new Error('invalidHeic'));
        },
      );
    });
    const plan = planColorConversion(color);
    applyColorPlan(plan, rgba);
    return { rgba, width, height, ...(plan.kind === 'embed' ? { icc: plan.icc } : {}) };
  } finally {
    images.forEach((image) => image.free());
  }
}

self.onmessage = async ({ data }: MessageEvent<HeicWorkerRequest>) => {
  try {
    let nativeError: string | undefined;
    if (data.native) {
      try {
        const decoded = await decodeNatively(data.buffer, data.native);
        const response: HeicWorkerResponse = {
          rgba: decoded.rgba.buffer as ArrayBuffer,
          width: decoded.width,
          height: decoded.height,
          decoder: 'native',
        };
        self.postMessage(response, { transfer: [response.rgba] });
        return;
      } catch (error) {
        nativeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
    }
    const decoded = await decodeWithLibheif(data.buffer, data.color);
    const response: HeicWorkerResponse = {
      rgba: decoded.rgba.buffer as ArrayBuffer,
      width: decoded.width,
      height: decoded.height,
      ...(decoded.icc ? { icc: decoded.icc } : {}),
      decoder: 'libheif',
      ...(nativeError ? { nativeError } : {}),
    };
    self.postMessage(response, { transfer: [response.rgba] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'invalidHeic' });
  }
};
