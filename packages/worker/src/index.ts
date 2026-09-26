/**
 * @pic-forge/worker
 *
 * Worker pool and image processing for PicForge.
 */

export { WorkerPool, getFormatConcurrencyLimit, getRecommendedWorkerPoolSize } from './workerPool';
export type { TaskCallbacks, WorkerPoolOptions } from './workerPool';
export { decodeImage, downscaleScratchPixels, resizeImage } from './imageProcessor';
export type { DownscaleStrategy } from './imageProcessor';
export {
  DEFAULT_MAX_PIXELS,
  MAX_CANVAS_DIMENSION,
  PERMANENT_IMAGE_ERROR_PREFIX,
  resolveResizeGeometry,
  validateResizeOptions,
  validateResizeTarget,
  validateSourceDimensions,
} from './imageProcessor';
export type { ResizeTargetLimits } from './imageProcessor';
export { buildEncoderOptions } from './encoderOptions';
export { createCompatImageEngine } from './compatImageEngine';
export type { CompatImageEngineDeps } from './compatImageEngine';
export { createImageProcessor } from './imageEngine';
export type {
  ImageEngine,
  ImageEngineKind,
  ImageProcessRequest,
  ImageProcessResult,
} from './imageEngine';

export {
  inspectAnimation,
  parseAnimation,
  animationError,
  finishWebpTimeline,
} from './animation/metadata';
export type { AnimationMetadata } from './animation/metadata';
export { calculateResizeGeometry } from './imageProcessor';

export { normalizeApngPoster, promoteApngRgba } from './animation/apng';
