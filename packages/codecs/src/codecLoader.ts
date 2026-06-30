/**
 * Codec loader — wraps @jsquash/* packages with manual WASM path resolution.
 *
 * WASM files are served from /wasm/ (public directory) to avoid
 * Vite dev mode URL resolution issues with import.meta.url.
 *
 * Each codec uses a Promise lock to prevent concurrent initialization.
 */

import type { MozjpegOptions, WebpOptions, OxipngOptions, AvifOptions } from './types';

const WASM_BASE = '/wasm/';

// Track loading state for progress indicator
let loadingCount = 0;

function notifyLoading() {
  loadingCount++;
  if (loadingCount === 1 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wasm-loading', { detail: { loading: true } }));
  }
}

function notifyLoaded() {
  loadingCount--;
  if (loadingCount === 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wasm-loading', { detail: { loading: false } }));
  }
}

// SIMD detection — cached after first check
let simdSupported: boolean | null = null;

async function detectSimd(): Promise<boolean> {
  if (simdSupported !== null) return simdSupported;
  try {
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65,
      0, 253, 15, 253, 98, 11,
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

export async function encodeImage(
  codecName: string,
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  options: Record<string, any>,
): Promise<ArrayBuffer> {
  const imageDataObj = new ImageData(new Uint8ClampedArray(imageData), width, height);

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
      return encodeWithCanvas(imageData, width, height, 'image/png', options?.quality ?? 75);
  }
}

async function encodeMozjpeg(imageData: ImageData, options: MozjpegOptions): Promise<ArrayBuffer> {
  if (!jpegEncode) {
    if (!jpegLock) {
      jpegLock = (async () => {
        try {
          notifyLoading();
          const mod = await import('@jsquash/jpeg/encode');
          await mod.init({ locateFile: (path: string) => WASM_BASE + path });
          jpegEncode = mod.default;
          notifyLoaded();
        } catch (err) {
          notifyLoaded();
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
          notifyLoading();
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
          notifyLoaded();
        } catch (err) {
          notifyLoaded();
          webpLock = null;
          throw err;
        }
      })();
    }
    await webpLock;
  }
  return webpEncode!(imageData, options);
}

async function encodeOxipng(imageData: ImageData, options: OxipngOptions): Promise<ArrayBuffer> {
  if (!oxipngOptimise) {
    if (!oxipngLock) {
      oxipngLock = (async () => {
        try {
          notifyLoading();
          const mod = await import('@jsquash/oxipng/optimise');
          await mod.init(WASM_BASE + 'oxipng.wasm');
          oxipngOptimise = mod.default;
          notifyLoaded();
        } catch (err) {
          notifyLoaded();
          oxipngLock = null;
          throw err;
        }
      })();
    }
    await oxipngLock;
  }
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
          notifyLoading();
          const mod = await import('@jsquash/avif/encode');
          await mod.init({ locateFile: (path: string) => WASM_BASE + path });
          avifEncode = mod.default;
          notifyLoaded();
        } catch (err) {
          notifyLoaded();
          avifLock = null;
          throw err;
        }
      })();
    }
    await avifLock;
  }
  return avifEncode!(imageData, options);
}

async function encodeWithCanvas(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  mime: string,
  quality: number,
): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(imageData), width, height), 0, 0);
  const q = quality / 100;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Release canvas bitmap memory eagerly
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) { reject(new Error('Canvas encoding failed')); return; }
        blob.arrayBuffer().then(resolve).catch(reject);
      },
      mime,
      q,
    );
  });
}

export function clearCodecCache(): void {
  jpegEncode = null; jpegLock = null;
  webpEncode = null; webpLock = null;
  oxipngOptimise = null; oxipngLock = null;
  avifEncode = null; avifLock = null;
}
