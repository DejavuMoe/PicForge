import type { ImageProcessRequest, ImageProcessResult } from '../imageEngine';
import { normalizeVipsError } from './vipsErrors';
import { initializeVips } from './vipsRuntime';
import { processVipsImage } from './vipsPipeline';

export type VipsWorkerRequest = Omit<ImageProcessRequest, 'onProgress'> & { token: number };
export type VipsWorkerResponse =
  | { token: number; phase: 'processing' }
  | { token: number; result: ImageProcessResult }
  | { token: number; error: string; failure: 'input' | 'runtime' | 'cancelled' };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let busy = false;
scope.onmessage = async ({ data }: MessageEvent<VipsWorkerRequest>) => {
  const send = (response: VipsWorkerResponse, transfer: Transferable[] = []) =>
    scope.postMessage(response, transfer);
  if (busy) {
    send({ token: data.token, error: 'Concurrent Vips Worker request', failure: 'runtime' });
    return;
  }
  busy = true;
  let initializing = false;
  try {
    // Blob is structured-cloned; the UI retains its immutable source for fallback.
    const input = await data.source.arrayBuffer();
    initializing = true;
    const vips = await initializeVips();
    initializing = false;
    send({ token: data.token, phase: 'processing' });
    const result = processVipsImage(vips, input, data.settings);
    send({ token: data.token, result }, [result.buffer]);
  } catch (error) {
    if ((error instanceof Error || error instanceof DOMException) && error.name === 'AbortError') {
      send({ token: data.token, error: error.message, failure: 'cancelled' });
      return;
    }
    const normalized = normalizeVipsError(error, initializing);
    send({ token: data.token, error: normalized.message, failure: normalized.failure });
  } finally {
    busy = false;
  }
};
