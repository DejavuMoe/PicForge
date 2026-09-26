import { runInFFmpegLane } from '../utils/ffmpegLane';
import { estimateHeicCost, estimateVideoCost, getProcessingBudget } from '../utils/resourceBudget';
import { cleanApertureFilters, readMovieBox } from './cleanAperture';
import { embedIccProfile } from './colorProfile';
import { readHeifInfo, type HeifColor } from './heif';
import type { HeicWorkerRequest, HeicWorkerResponse } from './heicWorker';
import { encodeJpeg } from './jpegEncoder';
import {
  audioArguments,
  splitMotionPhoto,
  videoArguments,
  type MediaItem,
  type MediaOutput,
  type MotionSettings,
} from './media';
import { convertWithWebCodecs, webCodecsVideoAvailable } from './webCodecsVideo';

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_HEIC_PIXELS = 50_000_000;
/** Pixels assumed when a HEIC declares no size; the decoder still enforces the limit. */
const UNKNOWN_HEIC_PIXELS = 24_000_000;
const HEIC_DECODE_TIMEOUT_MS = 120_000;
/** Downloading and compiling the ~31 MB FFmpeg core on a slow first visit. */
const ENGINE_LOAD_TIMEOUT_MS = 300_000;
const VIDEO_TIMEOUT_MS = 300_000;
const VIDEO_EXEC_TIMEOUT_MS = 240_000;
const INPUT_DIRECTORY = '/input';

function decodeHeic(buffer: ArrayBuffer, color: HeifColor | undefined, signal: AbortSignal) {
  return new Promise<Extract<HeicWorkerResponse, { rgba: ArrayBuffer }>>((resolve, reject) => {
    const worker = new Worker(new URL('./heicWorker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('timeout'));
    }, HEIC_DECODE_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<HeicWorkerResponse>) => {
      finish();
      if ('error' in data) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = () => {
      finish();
      reject(new Error('engineFailed'));
    };
    const request: HeicWorkerRequest = { buffer, color };
    worker.postMessage(request, [buffer]);
  });
}

async function convertStill(image: File, settings: MotionSettings, signal: AbortSignal) {
  const buffer = await image.arrayBuffer();
  signal.throwIfAborted();
  const info = readHeifInfo(new Uint8Array(buffer));
  const declared = info?.width && info?.height ? info.width * info.height : undefined;
  if (declared !== undefined && declared > MAX_HEIC_PIXELS) throw new Error('tooManyPixels');
  // Reserve before decoding; the decode and encode Workers never overlap.
  const release = await getProcessingBudget().acquire(
    estimateHeicCost(buffer.byteLength, declared ?? UNKNOWN_HEIC_PIXELS),
    signal,
  );
  try {
    const decoded = await decodeHeic(buffer, info?.color, signal);
    signal.throwIfAborted();
    const jpeg = await encodeJpeg(decoded.rgba, decoded.width, decoded.height, settings.quality, signal);
    return new Blob([decoded.icc ? embedIccProfile(jpeg, decoded.icc) : jpeg], {
      type: 'image/jpeg',
    });
  } finally {
    release();
  }
}

/**
 * Run one FFmpeg command inside the shared lane, reading the source lazily from the
 * File (WORKERFS), and return the named output file.
 */
function runFFmpeg(
  video: File,
  args: (input: string) => Promise<string[]>,
  output: string,
  signal: AbortSignal,
  progress?: (ratio: number) => void,
): Promise<Uint8Array> {
  return runInFFmpegLane(async () => {
    signal.throwIfAborted();
    const command = await args(`${INPUT_DIRECTORY}/input.mov`);
    signal.throwIfAborted();
    const { FFmpeg, FFFSType } = await import('@ffmpeg/ffmpeg');
    signal.throwIfAborted();
    const ffmpeg = new FFmpeg();
    let expired: 'engineFailed' | 'timeout' | undefined;
    const stop = (reason?: 'engineFailed' | 'timeout') => {
      expired ??= reason;
      ffmpeg.terminate();
    };
    const abort = () => stop();
    signal.addEventListener('abort', abort, { once: true });
    // Engine download/compile and conversion have separate watchdogs, so a slow
    // first load is reported as an engine problem rather than a conversion timeout.
    let timer = setTimeout(() => stop('engineFailed'), ENGINE_LOAD_TIMEOUT_MS);
    try {
      await ffmpeg.load({
        coreURL: new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.js', location.origin).href,
        wasmURL: new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.wasm', location.origin).href,
      });
      clearTimeout(timer);
      timer = setTimeout(() => stop('timeout'), VIDEO_TIMEOUT_MS);
      signal.throwIfAborted();
      // Read the source lazily from the File instead of copying it into MEMFS.
      await ffmpeg.createDir(INPUT_DIRECTORY);
      await ffmpeg.mount(
        FFFSType.WORKERFS,
        { blobs: [{ name: 'input.mov', data: video }] },
        INPUT_DIRECTORY,
      );
      if (progress) ffmpeg.on('progress', ({ progress: ratio }) => progress(ratio));
      const result = await ffmpeg.exec(command, VIDEO_EXEC_TIMEOUT_MS);
      if (result !== 0) throw new Error('videoFailed');
      const data = await ffmpeg.readFile(output);
      if (typeof data === 'string' || data.byteLength === 0) throw new Error('videoFailed');
      return new Uint8Array(data);
    } catch (error) {
      signal.throwIfAborted();
      if (expired) throw new Error(expired);
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      ffmpeg.terminate();
    }
  }, signal);
}

async function convertVideo(
  video: File,
  settings: MotionSettings,
  signal: AbortSignal,
  progress: (ratio: number) => void,
): Promise<{ video: Blob; engine: 'webcodecs' | 'ffmpeg' }> {
  // Budget before the lane: the lane holder must never wait for memory. The FFmpeg
  // estimate also covers the WebCodecs path, its audio helper and a fallback.
  const release = await getProcessingBudget().acquire(estimateVideoCost(video.size), signal);
  try {
    if (webCodecsVideoAvailable()) {
      const converted = await convertWithWebCodecs(video, settings, signal, progress, async () => {
        const m4a = await runFFmpeg(
          video,
          async (input) => audioArguments(input),
          'audio.m4a',
          signal,
        );
        return m4a.buffer.slice(m4a.byteOffset, m4a.byteOffset + m4a.byteLength) as ArrayBuffer;
      });
      if (converted) return { video: converted.video, engine: 'webcodecs' };
      signal.throwIfAborted();
    }
    const data = await runFFmpeg(
      video,
      async (input) => {
        const moov = await readMovieBox(video);
        return videoArguments(settings, moov ? cleanApertureFilters(moov) : undefined, input);
      },
      'output.mp4',
      signal,
      progress,
    );
    return {
      video: new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' }),
      engine: 'ffmpeg',
    };
  } finally {
    release();
  }
}

export async function processMedia(
  item: MediaItem,
  android: boolean,
  settings: MotionSettings,
  signal: AbortSignal,
  progress: (value: number) => void,
): Promise<MediaOutput> {
  signal.throwIfAborted();
  if ([item.image, item.video].some((file) => file && file.size > MAX_SOURCE_BYTES))
    throw new Error('tooLarge');
  if (android && item.image) return splitMotionPhoto(await item.image.arrayBuffer(), item.image);
  // The still and the video are independent: convert them concurrently. The first
  // failure cancels the other half and is the job's single terminal outcome.
  const inner = new AbortController();
  const forward = () => inner.abort(signal.reason);
  signal.addEventListener('abort', forward, { once: true });
  const stop = (error: unknown): never => {
    inner.abort();
    throw error;
  };
  let still = item.image ? 0 : 30;
  let video = 0;
  let reported = 0;
  const report = () => {
    const value = item.video ? still + Math.min(0.99, Math.max(0, video)) * 69 : still;
    if (value > reported) progress((reported = value));
  };
  try {
    const [image, converted] = await Promise.all([
      item.image
        ? (/\.jpe?g$/i.test(item.image.name)
            ? Promise.resolve<Blob>(item.image)
            : convertStill(item.image, settings, inner.signal)
          ).then((blob) => {
            still = item.video ? 30 : 100;
            report();
            return blob;
          }, stop)
        : undefined,
      item.video
        ? convertVideo(item.video, settings, inner.signal, (ratio) => {
            video = ratio;
            report();
          }).catch(stop)
        : undefined,
    ]);
    signal.throwIfAborted();
    const output: MediaOutput = {};
    if (image) output.image = image;
    if (converted) {
      output.video = converted.video;
      output.videoEngine = converted.engine;
    }
    return output;
  } finally {
    signal.removeEventListener('abort', forward);
  }
}
