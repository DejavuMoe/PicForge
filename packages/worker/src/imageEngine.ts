import { inspectAnimation, animationError, type AnimationMetadata } from './animation/metadata';
import type { CompressSettings } from '@pic-forge/codecs';

export type ImageEngineKind = 'compat' | 'animation';

export interface ImageProcessRequest {
  id: string;
  /** Source of truth: each engine reads its own buffer, including after a transfer failure. */
  source: Blob;
  animation?: AnimationMetadata;
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
  supports(request: ImageProcessRequest): boolean;
  process(request: ImageProcessRequest, signal?: AbortSignal): Promise<ImageProcessResult>;
}

/**
 * Route a request: animated GIF/APNG to the animation engine (never to a static
 * encoder, even when it fails), everything else to Compat.
 */
export function createImageProcessor(compat: ImageEngine, animation?: ImageEngine) {
  return {
    async process(request: ImageProcessRequest, signal?: AbortSignal): Promise<ImageProcessResult> {
      signal?.throwIfAborted();
      const metadata = await inspectAnimation(request.source);
      signal?.throwIfAborted();
      const engine = metadata ? animation : compat;
      if (!engine) animationError('unsupported');
      if (!metadata && !compat.supports(request)) throw new Error('Unsupported image format');
      const result = await engine.process(
        metadata ? { ...request, animation: metadata } : request,
        signal,
      );
      signal?.throwIfAborted();
      return result;
    },
  };
}
