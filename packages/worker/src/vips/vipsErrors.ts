import { ImageEngineError } from '../imageEngine';

/** wasm-vips 0.0.18 attaches [C++ type, message] to WebAssembly.Exception. */
export function normalizeVipsError(error: unknown, initializing = false): ImageEngineError {
  if (error instanceof ImageEngineError && !initializing) return error;
  const detail =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined;
  const native =
    Array.isArray(detail) && detail.every((part) => typeof part === 'string') ? detail : undefined;
  const message = native
    ? native.join(': ')
    : error instanceof Error
      ? error.message
      : String(error);
  const runtime =
    initializing ||
    error instanceof WebAssembly.RuntimeError ||
    error instanceof RangeError ||
    (error instanceof DOMException &&
      ['DataCloneError', 'QuotaExceededError'].includes(error.name)) ||
    (native !== undefined &&
      (native[0] !== 'vips::Error' ||
        message.includes('Error creating thread:') ||
        message.includes('out of memory') ||
        message.includes('no such operation ')));
  return new ImageEngineError(message, runtime ? 'runtime' : 'input');
}
