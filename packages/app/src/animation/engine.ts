import { runInFFmpegLane } from '../utils/ffmpegLane';
import { DEFAULT_OPTIONS, type CompressSettings } from '@pic-forge/codecs';
import {
  animationError,
  calculateResizeGeometry,
  type AnimationMetadata,
  type ImageEngine,
  type ImageProcessRequest,
  type ImageProcessResult,
} from '@pic-forge/worker';

/** Same pinned, self-hosted, single-thread core as Live Photos; no new WASM copy. */
export function animationArguments(meta: AnimationMetadata, settings: CompressSettings) {
  if (settings.outputFormat !== 'webp') animationError('format');
  if (meta.format === 'webp') animationError('unsupported');
  const defaults = DEFAULT_OPTIONS.webp as Record<string, unknown>;
  for (const [key, value] of Object.entries(settings.advanced ?? {})) {
    if (!['quality', 'lossless', 'method'].includes(key) && value !== defaults[key])
      animationError('settings');
  }
  const options = { ...DEFAULT_OPTIONS.webp, quality: settings.quality, ...settings.advanced };
  if (
    !Number.isFinite(options.quality) ||
    options.quality < 0 ||
    options.quality > 100 ||
    !Number.isInteger(options.method) ||
    options.method < 0 ||
    options.method > 6 ||
    ![0, 1].includes(options.lossless)
  )
    animationError('settings');
  const resize = settings.resize;
  if (
    resize?.enabled &&
    (!['absolute', 'percentage'].includes(resize.mode) ||
      !['contain', 'cover', 'stretch'].includes(resize.method) ||
      ![resize.maxWidth, resize.maxHeight, resize.percentage].every(
        (v) => Number.isFinite(v) && v > 0,
      ))
  )
    animationError('settings');
  const g = calculateResizeGeometry(
    meta.width,
    meta.height,
    resize?.enabled
      ? resize.mode === 'percentage'
        ? Math.round((meta.width * resize.percentage) / 100)
        : resize.maxWidth
      : meta.width,
    resize?.enabled
      ? resize.mode === 'percentage'
        ? Math.round((meta.height * resize.percentage) / 100)
        : resize.maxHeight
      : meta.height,
    resize?.enabled ? resize.method : 'contain',
  );
  if (
    g.targetWidth > 16383 ||
    g.targetHeight > 16383 ||
    g.targetWidth * g.targetHeight > 8_000_000 ||
    g.targetWidth * g.targetHeight * meta.ends.length > 500_000_000
  )
    animationError('limit');
  const filters = [
    ...(meta.poster ? ['select=gt(n\\,0)', 'setpts=PTS-STARTPTS'] : []),
    `crop=${g.sourceWidth}:${g.sourceHeight}:${g.sourceX}:${g.sourceY}`,
  ];
  if (g.targetWidth !== g.sourceWidth || g.targetHeight !== g.sourceHeight) {
    filters.push(
      'format=gbrap16le',
      'premultiply=inplace=1',
      `scale=${g.targetWidth}:${g.targetHeight}:flags=lanczos`,
      'unpremultiply=inplace=1',
    );
  }
  filters.push('format=bgra');
  return {
    width: g.targetWidth,
    height: g.targetHeight,
    args: [
      '-hide_banner',
      '-v',
      'error',
      '-xerror',
      '-err_detect',
      'explode',
      '-ignore_loop',
      '1',
      ...(meta.format === 'gif'
        ? ['-min_delay', '1', '-default_delay', '10']
        : ['-default_fps', '10']),
      '-i',
      meta.format === 'gif' ? 'input.gif' : 'input.apng',
      '-map',
      '0:v:0',
      '-an',
      '-sn',
      '-dn',
      '-map_metadata',
      '-1',
      '-vf',
      filters.join(','),
      '-fps_mode',
      'passthrough',
      '-enc_time_base',
      '1:1000',
      '-c:v',
      'libwebp_anim',
      '-quality',
      String(options.quality),
      '-lossless',
      String(options.lossless),
      '-compression_level',
      String(options.method),
      '-loop',
      String(meta.plays),
      '-threads',
      '1',
      '-y',
      'output.webp',
    ],
  };
}

async function convert(
  request: ImageProcessRequest,
  signal?: AbortSignal,
): Promise<ImageProcessResult> {
  signal?.throwIfAborted();
  const meta = request.animation;
  if (!meta) animationError('invalid');
  const { args, width, height } = animationArguments(meta, request.settings);
  request.onProgress?.(1);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Animation: timeout'));
    }, 120_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (signal?.aborted) return;
      if (typeof data.progress === 'number') {
        request.onProgress?.(data.progress);
        return;
      }
      finish();
      if (data.error) reject(new Error(data.error));
      else
        resolve({
          buffer: data.buffer,
          width,
          height,
          originalWidth: meta.width,
          originalHeight: meta.height,
          originalSize: request.source.size,
          outputSize: data.buffer.byteLength,
          engine: 'animation',
        });
    };
    worker.onerror = () => {
      finish();
      reject(new Error('Animation worker failed'));
    };
    try {
      signal?.throwIfAborted();
      worker.postMessage({ source: request.source, meta, args, width, height });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

export const animationEngine: ImageEngine = {
  kind: 'animation',
  supports: ({ animation }) => !!animation,
  process(request, signal) {
    return runInFFmpegLane(() => convert(request, signal), signal);
  },
};
