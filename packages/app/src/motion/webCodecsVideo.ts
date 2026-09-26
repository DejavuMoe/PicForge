import type { MotionSettings } from './media';
import type { AudioMode, VideoWorkerRequest, VideoWorkerResponse } from './videoWorker';

/** A three-second Live Photo takes seconds; a stalled hardware session falls back. */
const WEBCODECS_TIMEOUT_MS = 120_000;
/** Runtime failures (not capability gaps) before the session stops trying WebCodecs. */
const MAX_RUNTIME_FAILURES = 2;
let runtimeFailures = 0;

export interface WebCodecsVideo {
  video: Blob;
  codec: string;
  audio: AudioMode;
}

export function webCodecsVideoAvailable(): boolean {
  return (
    runtimeFailures < MAX_RUNTIME_FAILURES &&
    typeof VideoDecoder === 'function' &&
    typeof VideoEncoder === 'function' &&
    typeof VideoFrame === 'function'
  );
}

/** Test hook. */
export function resetWebCodecsVideo(): void {
  runtimeFailures = 0;
}

/**
 * Convert with the WebCodecs Worker. Resolves `undefined` when this runtime or file
 * needs the FFmpeg path instead (the caller retries from the same original File);
 * rejects only when cancelled. `audioHelper` produces an AAC M4A with FFmpeg when
 * the Worker cannot encode the source audio itself.
 */
export function convertWithWebCodecs(
  video: File,
  settings: MotionSettings,
  signal: AbortSignal,
  progress: (ratio: number) => void,
  audioHelper: () => Promise<ArrayBuffer>,
): Promise<WebCodecsVideo | undefined> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./videoWorker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (result?: WebCodecsVideo, failure?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (failure) {
        runtimeFailures += 1;
        console.warn(`WebCodecs video failed (${failure}); converting with FFmpeg`);
      }
      resolve(result);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => finish(undefined, 'timeout'), WEBCODECS_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      finish(undefined, 'worker');
    };
    worker.onmessage = ({ data }: MessageEvent<VideoWorkerResponse>) => {
      if (settled) return;
      switch (data.type) {
        case 'progress':
          progress(data.value);
          break;
        case 'needAudio':
          audioHelper().then(
            (m4a) => {
              if (!settled) {
                const message: VideoWorkerRequest = { type: 'audio', m4a };
                worker.postMessage(message, [m4a]);
              }
            },
            (error) => {
              if (signal.aborted) abort();
              else finish(undefined, `audio ${error instanceof Error ? error.message : error}`);
            },
          );
          break;
        case 'unsupported':
          finish();
          break;
        case 'error':
          finish(undefined, data.message);
          break;
        case 'done':
          finish({
            video: data.mp4,
            codec: data.codec,
            audio: data.audio,
          });
          break;
      }
    };
    const request: VideoWorkerRequest = { type: 'start', video, settings };
    worker.postMessage(request);
  });
}
