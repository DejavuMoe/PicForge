import type Vips from 'wasm-vips';
import scriptUrl from 'wasm-vips?url';
import wasmUrl from 'wasm-vips/vips.wasm?url';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const instanceId = crypto.randomUUID();
let runtime: Promise<typeof Vips> | undefined;

function initialize() {
  return (runtime ??= (async () => {
    const { default: createVips } = (await import(/* @vite-ignore */ scriptUrl)) as {
      default: typeof Vips;
    };
    const vips = await createVips({
      dynamicLibraries: [],
      mainScriptUrlOrBlob: scriptUrl,
      locateFile: (name) => {
        if (name === 'vips.wasm') return wasmUrl;
        throw new Error(`Unexpected vips asset: ${name}`);
      },
    });
    vips.concurrency(1);
    return vips;
  })());
}

scope.onmessage = async ({ data }: MessageEvent<{ buffer?: ArrayBuffer; scale?: number }>) => {
  try {
    const vips = await initialize();
    if (!data.buffer) {
      scope.postMessage({ instanceId, version: vips.version() });
      return;
    }
    const scale = data.scale;
    if (!scale || !Number.isFinite(scale) || scale > 1 || scale <= 0) {
      throw new Error('Probe scale must be greater than 0 and at most 1');
    }
    const source = vips.Image.newFromBuffer(data.buffer, '', { access: 'sequential' });
    let resized: Vips.Image | undefined;
    try {
      if (source.width * source.height > 50_000_000) throw new Error('Probe exceeds 50 MP');
      resized = source.resize(scale);
      // Copy out of WASM memory before transferring ownership to the caller.
      const buffer = new Uint8Array(resized.writeToBuffer('.jpg[Q=80]')).buffer;
      scope.postMessage(
        {
          instanceId,
          version: vips.version(),
          buffer,
          width: resized.width,
          height: resized.height,
        },
        [buffer],
      );
    } finally {
      resized?.delete();
      source.delete();
    }
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
