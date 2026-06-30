/**
 * @pic-forge/worker
 *
 * Worker pool and image processing for PicForge.
 */

export {
  WorkerPool,
  getFormatConcurrencyLimit,
  getRecommendedWorkerPoolSize,
} from './workerPool';
export type { TaskCallbacks, WorkerPoolOptions } from './workerPool';
export { decodeImage, resizeImage } from './imageProcessor';
