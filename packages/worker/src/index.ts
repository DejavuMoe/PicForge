/**
 * @pic-forge/worker
 *
 * Worker pool and image processing for PicForge.
 */

export { WorkerPool, getFormatConcurrencyLimit, getRecommendedWorkerPoolSize } from './workerPool';
export type { TaskCallbacks, WorkerPoolOptions } from './workerPool';
export { decodeImage, resizeImage } from './imageProcessor';
export { buildEncoderOptions } from './encoderOptions';
export { createCompatImageEngine } from './compatImageEngine';
export type { CompatImageEngineDeps } from './compatImageEngine';
export { createImageProcessor, getImageRuntimeCapabilities, ImageEngineError } from './imageEngine';
export type {
  ImageEngine,
  ImageEngineKind,
  ImageEnginePolicy,
  ImageRuntimeCapabilities,
  ImageProcessRequest,
  ImageProcessResult,
} from './imageEngine';
