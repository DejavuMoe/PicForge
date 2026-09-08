import type Vips from 'wasm-vips';
import scriptUrl from 'wasm-vips?url';
import wasmUrl from 'wasm-vips/vips.wasm?url';

let runtime: Promise<typeof Vips> | undefined;

/** One runtime per dedicated Worker. The pinned browser glue caps pthreads at six. */
export function initializeVips(): Promise<typeof Vips> {
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
    // Do not retain per-image operations/source data between jobs.
    vips.Cache.max(0);
    const probe = vips.Image.black(1, 1);
    try {
      if (!probe.jpegsaveBuffer({ Q: 75, keep: 'none' }).length)
        throw new Error('Vips initialization probe failed');
    } finally {
      probe.delete();
    }
    return vips;
  })());
}
