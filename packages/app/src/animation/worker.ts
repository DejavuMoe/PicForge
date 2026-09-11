import {
  animationError,
  finishWebpTimeline,
  normalizeApngPoster,
  promoteApngRgba,
  parseAnimation,
  type AnimationMetadata,
} from '@pic-forge/worker';

// The pinned @ffmpeg/core factory surface already used by @ffmpeg/ffmpeg's worker.
interface Core {
  FS: {
    writeFile(path: string, bytes: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  setProgress(callback: (value: { time: number }) => void): void;
  setTimeout(ms: number): void;
  exec(...args: string[]): void;
  ret: number;
  reset(): void;
}

self.onmessage = async ({
  data,
}: MessageEvent<{
  source: Blob;
  meta: AnimationMetadata;
  args: string[];
  width: number;
  height: number;
}>) => {
  try {
    const { source, meta, args, width, height } = data;
    const coreURL = new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.js', self.location.origin).href;
    const wasmURL = new URL('/wasm/ffmpeg-0.12.10/ffmpeg-core.wasm', self.location.origin).href;
    const { default: createCore } = await import(/* @vite-ignore */ coreURL);
    // Match the pinned wrapper's locateFile contract, keeping every asset same-origin.
    const core: Core = await createCore({
      mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL }))}`,
    });
    let input: Uint8Array = new Uint8Array(await source.arrayBuffer());
    if (meta.normalizeRgba) {
      input = promoteApngRgba(input, (png) => {
        core.FS.writeFile('patch.png', png);
        core.setTimeout(110_000);
        try {
          core.exec(
            '-v',
            'error',
            '-xerror',
            '-err_detect',
            'explode',
            '-i',
            'patch.png',
            '-frames:v',
            '1',
            '-pix_fmt',
            'rgba',
            '-c:v',
            'png',
            '-y',
            'rgba.png',
          );
          if (core.ret !== 0) animationError('decode');
          return core.FS.readFile('rgba.png');
        } finally {
          core.reset();
          core.FS.unlink('patch.png');
          try {
            core.FS.unlink('rgba.png');
          } catch {
            /* Failed encodes may not create a file. */
          }
        }
      });
    }
    if (meta.poster) input = normalizeApngPoster(input);
    core.FS.writeFile(meta.format === 'gif' ? 'input.gif' : 'input.apng', input);
    self.postMessage({ progress: 10 });
    core.setProgress(({ time }) =>
      self.postMessage({
        progress:
          10 + Math.min(0.99, Math.max(0, time / 1000 / meta.ends[meta.ends.length - 1])) * 85,
      }),
    );
    core.setTimeout(110_000);
    core.exec(...args);
    if (core.ret !== 0) animationError('decode');
    const output = core.FS.readFile('output.webp');
    if (!output.length || output.length > 100 * 1024 * 1024) animationError('output');
    const finalized = finishWebpTimeline(output, meta, width, height);
    const checked = parseAnimation(finalized);
    if (
      !checked ||
      checked.width !== width ||
      checked.height !== height ||
      checked.plays !== meta.plays ||
      checked.ends[checked.ends.length - 1] !== meta.ends[meta.ends.length - 1]
    )
      animationError('output');
    // Independent owned bytes, never transfer a WASM heap or a borrowed view.
    const buffer = new Uint8Array(finalized).buffer;
    self.postMessage({ buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
