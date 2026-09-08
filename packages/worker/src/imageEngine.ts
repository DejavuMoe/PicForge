import type { CompressSettings } from '@pic-forge/codecs';

export type ImageEngineKind = 'compat' | 'vips';
export type ImageEnginePolicy = 'auto' | ImageEngineKind;

export interface ImageRuntimeCapabilities {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  worker: boolean;
  wasm: boolean;
  /** Undefined until initialization has actually been attempted. */
  vipsInitializable?: boolean;
}

export function getImageRuntimeCapabilities(): ImageRuntimeCapabilities {
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    worker: typeof Worker !== 'undefined',
    wasm: typeof WebAssembly !== 'undefined',
  };
}

export interface ImageProcessRequest {
  id: string;
  /** Source of truth: each engine reads its own buffer, including after a transfer failure. */
  source: Blob;
  settings: CompressSettings;
  onProgress?: (progress: number) => void;
}

export interface ImageProcessResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  outputSize: number;
  engine: ImageEngineKind;
}

export interface ImageEngine {
  readonly kind: ImageEngineKind;
  supports(request: ImageProcessRequest, capabilities: ImageRuntimeCapabilities): boolean;
  process(request: ImageProcessRequest, signal?: AbortSignal): Promise<ImageProcessResult>;
}

/** Only explicitly classified infrastructure faults count toward the session breaker. */
export class ImageEngineError extends Error {
  constructor(
    message: string,
    readonly failure: 'input' | 'runtime',
  ) {
    super(message);
    this.name = 'ImageEngineError';
  }
}

export function createImageProcessor(compat: ImageEngine, vips?: ImageEngine) {
  let runtimeFailures = 0;
  return {
    get vipsDisabled() {
      return runtimeFailures >= 2;
    },
    async process(
      request: ImageProcessRequest,
      signal?: AbortSignal,
      policy: ImageEnginePolicy = 'auto',
      capabilities = getImageRuntimeCapabilities(),
    ): Promise<ImageProcessResult> {
      signal?.throwIfAborted();
      if (
        policy !== 'compat' &&
        vips &&
        runtimeFailures < 2 &&
        capabilities.crossOriginIsolated &&
        capabilities.sharedArrayBuffer &&
        capabilities.worker &&
        capabilities.wasm &&
        capabilities.vipsInitializable !== false
      ) {
        try {
          if (vips.supports(request, capabilities)) {
            const result = await vips.process(request, signal);
            signal?.throwIfAborted();
            return result;
          }
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof Error && error.name === 'AbortError') throw error;
          if (error instanceof ImageEngineError && error.failure === 'runtime')
            runtimeFailures += 1;
          // Exactly one compatibility attempt, with the original Blob, never a detached buffer.
        }
      }
      signal?.throwIfAborted();
      if (!compat.supports(request, capabilities)) throw new Error('Unsupported image format');
      const result = await compat.process(request, signal);
      signal?.throwIfAborted();
      return result;
    },
  };
}
