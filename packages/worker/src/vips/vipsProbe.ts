/** Internal Phase 2 experiment; the application still uses its existing codec pipeline. */
export function getVipsCapabilities() {
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    worker: typeof Worker !== 'undefined',
    wasm: typeof WebAssembly !== 'undefined',
  };
}

export interface VipsProbeResult {
  instanceId: string;
  version: string;
  buffer?: ArrayBuffer;
  width?: number;
  height?: number;
}

export class VipsProbe {
  private worker?: Worker;
  private reject?: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  vipsInitializable = false;

  /** Transfers the optional input buffer; callers must retain source bytes for a retry. */
  async run(buffer?: ArrayBuffer, scale = 0.5): Promise<VipsProbeResult> {
    if (!Object.values(getVipsCapabilities()).every(Boolean)) {
      throw new Error(
        'wasm-vips unavailable: cross-origin isolation, SAB, Worker and WASM required',
      );
    }
    if (this.reject) throw new Error('Vips probe is busy');
    if (buffer && (buffer.byteLength === 0 || buffer.byteLength > 50 * 1024 * 1024)) {
      throw new Error('Probe input must be between 1 byte and 50 MiB');
    }
    this.worker ??= new Worker(new URL('./vipsWorker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.timer = setTimeout(() => this.dispose('Vips probe timed out'), 30_000);
      worker.onerror = (event) => {
        event.preventDefault();
        this.dispose(event.message || 'Vips worker crashed');
      };
      worker.onmessageerror = () => this.dispose('Invalid Vips worker response');
      worker.onmessage = ({ data }: MessageEvent<VipsProbeResult & { error?: string }>) => {
        if (data.error) {
          this.dispose(data.error);
          return;
        }
        clearTimeout(this.timer);
        this.reject = undefined;
        this.vipsInitializable = true;
        resolve(data);
      };
      try {
        worker.postMessage({ buffer, scale }, buffer ? [buffer] : []);
      } catch (error) {
        this.dispose(error instanceof Error ? error.message : String(error));
      }
    });
  }

  dispose(reason = 'Vips probe disposed') {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = undefined;
    this.vipsInitializable = false;
    this.reject?.(new Error(reason));
    this.reject = undefined;
  }
}
