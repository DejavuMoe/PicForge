import { cleanApertureFilters } from './cleanAperture';
import {
  splitMotionPhoto,
  videoArguments,
  type MediaItem,
  type MediaOutput,
  type MotionSettings,
} from './media';

export async function processMedia(
  item: MediaItem,
  android: boolean,
  settings: MotionSettings,
  signal: AbortSignal,
  progress: (value: number) => void,
): Promise<MediaOutput> {
  signal.throwIfAborted();
  if ([item.image, item.video].some((file) => file && file.size > 100 * 1024 * 1024))
    throw new Error('tooLarge');
  if (android && item.image) return splitMotionPhoto(await item.image.arrayBuffer());
  const output: MediaOutput = {};
  if (item.image) {
    if (/\.jpe?g$/i.test(item.image.name)) output.image = item.image;
    else {
      const buffer = await item.image.arrayBuffer();
      signal.throwIfAborted();
      output.image = await new Promise<Blob>((resolve, reject) => {
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
        }, 120_000);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
          finish();
          if (data.error) reject(new Error(data.error));
          else resolve(new Blob([data.output], { type: 'image/jpeg' }));
        };
        worker.onerror = () => {
          finish();
          reject(new Error('engineFailed'));
        };
        worker.postMessage({ buffer, quality: settings.quality }, [buffer]);
      });
    }
    progress(item.video ? 30 : 100);
  }
  if (item.video) {
    signal.throwIfAborted();
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    signal.throwIfAborted();
    const ffmpeg = new FFmpeg();
    const abort = () => ffmpeg.terminate();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 300_000);
    try {
      await ffmpeg.load({
        coreURL: new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.js', location.origin).href,
        wasmURL: new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.wasm', location.origin).href,
      });
      signal.throwIfAborted();
      const input = await item.video.arrayBuffer();
      const aperture = cleanApertureFilters(input);
      await ffmpeg.writeFile('input.mov', new Uint8Array(input));
      ffmpeg.on('progress', ({ progress: ratio }) =>
        progress(30 + Math.min(0.99, Math.max(0, ratio)) * 69),
      );
      const result = await ffmpeg.exec(videoArguments(settings, aperture), 240_000);
      if (result !== 0) throw new Error('videoFailed');
      const data = await ffmpeg.readFile('output.mp4');
      if (typeof data === 'string' || data.byteLength === 0) throw new Error('videoFailed');
      output.video = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      ffmpeg.terminate();
    }
  }
  signal.throwIfAborted();
  return output;
}
