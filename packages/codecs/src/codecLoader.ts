/**
 * Codec loader — wraps @jsquash/* packages with manual WASM path resolution.
 *
 * WASM files are served from /wasm/ (public directory) to avoid
 * Vite dev mode URL resolution issues with import.meta.url.
 *
 * Each codec uses a Promise lock to prevent concurrent initialization.
 * Encoding runs in Web Workers, so this module must not depend on window/document.
 */

import type { MozjpegOptions, WebpOptions, OxipngOptions, AvifOptions } from './types';

const WASM_BASE = '/wasm/';

// SIMD detection — cached after first check
let simdSupported: boolean | null = null;

async function detectSimd(): Promise<boolean> {
  if (simdSupported !== null) return simdSupported;
  try {
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
      15, 253, 98, 11,
    ]);
    simdSupported = WebAssembly.validate(bytes);
  } catch {
    simdSupported = false;
  }
  return simdSupported;
}

// Promise locks for concurrent initialization safety
let jpegLock: Promise<void> | null = null;
let jpegEncode: ((data: ImageData, options?: any) => Promise<ArrayBuffer>) | null = null;

let webpLock: Promise<void> | null = null;
let webpEncode: ((data: ImageData, options?: any) => Promise<ArrayBuffer>) | null = null;

let oxipngLock: Promise<void> | null = null;
let oxipngOptimise: ((data: any, options?: any) => Promise<ArrayBuffer>) | null = null;

let avifLock: Promise<void> | null = null;
let avifEncode: ((data: ImageData, options?: any) => Promise<ArrayBuffer>) | null = null;

/**
 * Upstream @jsquash/avif reads `data.data.buffer` without honoring byteOffset or
 * byteLength, so a partial view would encode pixels from the start of the whole
 * backing buffer. Normalize a partial view to its visible bytes once, here at the
 * shared boundary. A fixed, non-shared ArrayBuffer view that spans its entire buffer keeps
 * the zero-extra-copy fast path.
 *
 * Lifetime: encoders read the view after the module-init await resolves, inside
 * the synchronous `module.encode(...)` call. The caller must keep the view alive
 * until the returned promise settles; the image Worker transfers and discards it,
 * and the HEIC path builds a fresh full-buffer array.
 */
function normalizedPixelView(imageData: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  if (
    imageData.buffer instanceof ArrayBuffer &&
    !('resizable' in imageData.buffer && imageData.buffer.resizable) &&
    imageData.byteOffset === 0 &&
    imageData.byteLength === imageData.buffer.byteLength
  ) {
    return new Uint8ClampedArray(imageData.buffer);
  }
  return new Uint8ClampedArray(imageData);
}

export async function encodeImage(
  codecName: string,
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  options: Record<string, any>,
): Promise<ArrayBuffer> {
  const view = normalizedPixelView(imageData);
  const imageDataObj = new ImageData(view, width, height);

  switch (codecName) {
    case 'mozjpeg':
      return encodeMozjpeg(imageDataObj, options as MozjpegOptions);
    case 'webp':
      return encodeWebp(imageDataObj, options as WebpOptions);
    case 'oxipng':
      return encodeOxipng(imageDataObj, options as OxipngOptions);
    case 'avif':
      return encodeAvif(imageDataObj, options as AvifOptions);
    default:
      throw new Error(`Unsupported output format: ${codecName}`);
  }
}

async function encodeMozjpeg(imageData: ImageData, options: MozjpegOptions): Promise<ArrayBuffer> {
  if (!jpegEncode) {
    if (!jpegLock) {
      jpegLock = (async () => {
        try {
          const mod = await import('@jsquash/jpeg/encode');
          await mod.init({ locateFile: (path: string) => WASM_BASE + path });
          jpegEncode = mod.default;
        } catch (err) {
          jpegLock = null;
          throw err;
        }
      })();
    }
    await jpegLock;
  }
  return jpegEncode!(imageData, options);
}

async function encodeWebp(imageData: ImageData, options: WebpOptions): Promise<ArrayBuffer> {
  if (!webpEncode) {
    if (!webpLock) {
      webpLock = (async () => {
        try {
          const hasSimd = await detectSimd();
          const mod = await import('@jsquash/webp/encode');
          await mod.init({
            locateFile: (path: string) => {
              // Use SIMD variant if supported
              if (hasSimd && path === 'webp_enc.wasm') {
                return WASM_BASE + 'webp_enc_simd.wasm';
              }
              return WASM_BASE + path;
            },
          });
          webpEncode = mod.default;
        } catch (err) {
          webpLock = null;
          throw err;
        }
      })();
    }
    await webpLock;
  }
  return webpEncode!(imageData, options);
}

async function loadOxipng(): Promise<void> {
  if (!oxipngOptimise) {
    if (!oxipngLock) {
      oxipngLock = (async () => {
        try {
          const mod = await import('@jsquash/oxipng/optimise');
          await mod.init(WASM_BASE + 'oxipng.wasm');
          oxipngOptimise = mod.default;
        } catch (err) {
          oxipngLock = null;
          throw err;
        }
      })();
    }
    await oxipngLock;
  }
}

async function encodeOxipng(imageData: ImageData, options: OxipngOptions): Promise<ArrayBuffer> {
  await loadOxipng();
  return oxipngOptimise!(imageData, {
    level: options.level,
    interlace: options.interlace,
    optimiseAlpha: options.optimizeAlpha,
  });
}

async function encodeAvif(imageData: ImageData, options: AvifOptions): Promise<ArrayBuffer> {
  if (!avifEncode) {
    if (!avifLock) {
      avifLock = (async () => {
        try {
          const mod = await import('@jsquash/avif/encode');
          await mod.init({ locateFile: (path: string) => WASM_BASE + path });
          avifEncode = mod.default;
        } catch (err) {
          avifLock = null;
          throw err;
        }
      })();
    }
    await avifLock;
  }
  return avifEncode!(imageData, options);
}

/**
 * Losslessly optimise complete PNG file bytes. The caller owns `png` and must
 * already have removed every chunk whose metadata or colour semantics must not
 * be exported; OxiPNG only re-filters and re-compresses what it receives.
 */
export async function optimisePng(png: ArrayBuffer, options: OxipngOptions): Promise<ArrayBuffer> {
  await loadOxipng();
  return oxipngOptimise!(png, {
    level: options.level,
    interlace: options.interlace,
    optimiseAlpha: options.optimizeAlpha,
  });
}
