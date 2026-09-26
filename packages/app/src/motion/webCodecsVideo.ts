import type { MotionSettings } from './media';
import type {
  AudioMode,
  VideoLatency,
  VideoWorkerRequest,
  VideoWorkerResponse,
} from './videoWorker';

/**
 * No Worker message for this long is a stalled session. The Worker reports every
 * frame and detects its own codec stalls much sooner; waiting for the FFmpeg audio
 * helper is excluded, because that has its own engine and conversion timeouts.
 */
const INACTIVITY_MS = 30_000;
/** Runtime failures (not capability gaps) before the session stops trying WebCodecs. */
const MAX_RUNTIME_FAILURES = 2;
let runtimeFailures = 0;
/** Once a quality-mode encoder stalled in this session, start in realtime mode. */
let latency: VideoLatency = 'quality';

export interface WebCodecsVideo {
  video: Blob;
  codec: string;
  audio: AudioMode;
  latency: VideoLatency;
  stalled?: string;
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
  latency = 'quality';
}

/**
 * Convert with the WebCodecs Worker. Resolves `undefined` when this runtime or file
 * needs the FFmpeg path instead (the caller retries from the same original File);
 * rejects only when cancelled. `audioHelper` produces an AAC M4A with FFmpeg when
 * the Worker cannot encode the source audio itself; its signal is aborted as soon as
 * this attempt ends, so a failed attempt never keeps holding the FFmpeg lane.
 */
export function convertWithWebCodecs(
  video: File,
  settings: MotionSettings,
  signal: AbortSignal,
  progress: (ratio: number) => void,
  audioHelper: (signal: AbortSignal) => Promise<ArrayBuffer>,
): Promise<WebCodecsVideo | undefined> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./videoWorker.ts', import.meta.url), { type: 'module' });
    const helper = new AbortController();
    let settled = false;
    let awaitingAudio = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      clearTimeout(timer);
      if (!awaitingAudio) timer = setTimeout(() => finish(undefined, 'stalled'), INACTIVITY_MS);
    };
    const close = () => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      helper.abort(signal.aborted ? signal.reason : undefined);
    };
    const finish = (result?: WebCodecsVideo, failure?: string) => {
      if (settled) return;
      close();
      if (failure) {
        runtimeFailures += 1;
        console.warn(`WebCodecs video failed (${failure}); converting with FFmpeg`);
      }
      resolve(result);
    };
    const abort = () => {
      if (settled) return;
      close();
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      finish(undefined, 'worker');
    };
    worker.onmessage = ({ data }: MessageEvent<VideoWorkerResponse>) => {
      if (settled) return;
      watch();
      switch (data.type) {
        case 'progress':
          progress(data.value);
          break;
        case 'needAudio':
          awaitingAudio = true;
          watch();
          audioHelper(helper.signal).then(
            (m4a) => {
              if (settled) return;
              awaitingAudio = false;
              watch();
              const message: VideoWorkerRequest = { type: 'audio', m4a };
              worker.postMessage(message, [m4a]);
            },
            (error) => {
              if (settled) return;
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
          if (data.latency === 'realtime') latency = 'realtime';
          finish({
            video: data.mp4,
            codec: data.codec,
            audio: data.audio,
            latency: data.latency,
            ...(data.stalled ? { stalled: data.stalled } : {}),
          });
          break;
      }
    };
    const request: VideoWorkerRequest = { type: 'start', video, settings, latency };
    worker.postMessage(request);
    watch();
  });
}
