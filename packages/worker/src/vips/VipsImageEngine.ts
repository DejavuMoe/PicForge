import {
  ImageEngineError,
  getImageRuntimeCapabilities,
  type ImageEngine,
  type ImageProcessRequest,
  type ImageProcessResult,
  type ImageRuntimeCapabilities,
} from '../imageEngine';
import { mapVipsEncoderOptions } from './vipsOptions';
import type { VipsWorkerRequest, VipsWorkerResponse } from './vipsEngineWorker';

type Job = {
  request: ImageProcessRequest;
  token: number;
  signal?: AbortSignal;
  resolve: (result: ImageProcessResult) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

/** Internal qualification engine; production auto remains Compat until Phase 6. */
export class VipsImageEngine implements ImageEngine {
  readonly kind = 'vips' as const;
  private worker?: Worker;
  private queue: Job[] = [];
  private active?: Job;
  private timer?: ReturnType<typeof setTimeout>;
  private token = 0;
  private stage: 'idle' | 'preparing' | 'processing' = 'idle';

  /** Internal diagnostics, including deterministic cancellation qualification. */
  get phase() {
    return this.stage;
  }

  constructor(
    private readonly createWorker = () =>
      new Worker(new URL('./vipsEngineWorker.ts', import.meta.url), { type: 'module' }),
    // Qualification watchdog only; Phase 5/6 must calibrate by pixels/codec.
    private readonly timeoutMs = 90_000,
  ) {}

  supports({ source, settings }: ImageProcessRequest, capabilities: ImageRuntimeCapabilities) {
    return (
      capabilities.crossOriginIsolated &&
      capabilities.sharedArrayBuffer &&
      capabilities.worker &&
      capabilities.wasm &&
      capabilities.vipsInitializable !== false &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(source.type) &&
      source.size > 0 &&
      source.size <= 50 * 1024 * 1024 &&
      mapVipsEncoderOptions(settings) !== null
    );
  }

  process(request: ImageProcessRequest, signal?: AbortSignal): Promise<ImageProcessResult> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (!this.supports(request, getImageRuntimeCapabilities())) {
      return Promise.reject(
        new ImageEngineError('Unsupported Vips request or environment', 'input'),
      );
    }
    return new Promise((resolve, reject) => {
      const job: Job = {
        request,
        signal,
        token: ++this.token,
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', abort),
      };
      const abort = () => {
        if (this.active === job) {
          // Synchronous WASM cannot service a cancel message. Kill its whole realm,
          // including nested pthreads, before allowing another job to start.
          this.resetWorker();
          this.finish(
            undefined,
            signal?.reason ?? new DOMException('Task cancelled', 'AbortError'),
          );
        } else {
          this.queue = this.queue.filter((queued) => queued !== job);
          job.cleanup();
          reject(signal?.reason ?? new DOMException('Task cancelled', 'AbortError'));
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  private resetWorker() {
    this.worker?.terminate();
    this.worker = undefined;
  }

  private finish(result?: ImageProcessResult, error?: unknown) {
    const job = this.active;
    if (!job) return;
    clearTimeout(this.timer);
    this.active = undefined;
    this.stage = 'idle';
    job.cleanup();
    if (error !== undefined) job.reject(error);
    else if (job.signal?.aborted) job.reject(job.signal.reason);
    else if (result) job.resolve(result);
    this.pump();
  }

  private failRuntime(message: string) {
    this.resetWorker();
    this.finish(undefined, new ImageEngineError(message, 'runtime'));
  }

  private pump() {
    if (this.active) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.stage = 'preparing';
    try {
      // A real start event, not a made-up codec percentage. Remain at 0 until
      // result delivery; the controller owns the final 100% state.
      job.request.onProgress?.(0);
    } catch (error) {
      this.finish(undefined, error);
      return;
    }
    if (this.active !== job) return;
    try {
      this.worker ??= this.createWorker();
      const worker = this.worker;
      worker.onerror = (event) => {
        event.preventDefault();
        if (this.worker === worker) this.failRuntime(event.message || 'Vips Worker crashed');
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.failRuntime('Invalid Vips Worker response');
      };
      worker.onmessage = ({ data }: MessageEvent<VipsWorkerResponse>) => {
        if (this.worker !== worker) return;
        if (!data || typeof data.token !== 'number') {
          this.failRuntime('Invalid Vips Worker response');
          return;
        }
        if (this.active?.token !== data.token) return;
        if ('phase' in data && data.phase === 'processing') {
          this.stage = 'processing';
          return;
        }
        if ('error' in data) {
          if (
            typeof data.error !== 'string' ||
            !['input', 'runtime', 'cancelled'].includes(data.failure)
          ) {
            this.failRuntime('Invalid Vips Worker error');
            return;
          }
          if (data.failure === 'cancelled') {
            this.resetWorker();
            this.finish(undefined, new DOMException(data.error, 'AbortError'));
            return;
          }
          if (data.failure === 'runtime') this.resetWorker();
          this.finish(undefined, new ImageEngineError(data.error, data.failure));
        } else if (
          'result' in data &&
          data.result?.buffer instanceof ArrayBuffer &&
          data.result.engine === 'vips' &&
          data.result.originalSize === job.request.source.size &&
          data.result.outputSize > 0 &&
          data.result.outputSize === data.result.buffer.byteLength &&
          [
            data.result.width,
            data.result.height,
            data.result.originalWidth,
            data.result.originalHeight,
          ].every((value) => Number.isInteger(value) && value > 0)
        )
          this.finish(data.result);
        else this.failRuntime('Invalid Vips Worker result');
      };
      this.timer = setTimeout(() => {
        if (this.active === job && this.worker === worker) {
          this.failRuntime('Vips qualification watchdog expired');
        }
      }, this.timeoutMs);
      const message: VipsWorkerRequest = {
        token: job.token,
        id: job.request.id,
        source: job.request.source,
        settings: job.request.settings,
      };
      // No fabricated codec percentages. The existing UI completes at result delivery.
      worker.postMessage(message);
    } catch (error) {
      this.failRuntime(error instanceof Error ? error.message : String(error));
    }
  }

  dispose() {
    const pending = this.queue.splice(0);
    const cancelled = new DOMException('Vips engine disposed', 'AbortError');
    for (const job of pending) {
      job.cleanup();
      job.reject(cancelled);
    }
    this.resetWorker();
    this.finish(undefined, cancelled);
  }
}

// Import this shared lane for application integration, never one per Compat worker.
export const vipsImageEngine = new VipsImageEngine();
