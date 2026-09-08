import { VipsProbe, getVipsCapabilities } from '../../packages/worker/src/vips/vipsProbe';
import {
  createCompatImageEngine,
  createImageProcessor,
  decodeImage,
  resizeImage,
  WorkerPool,
} from '../../packages/worker/src/index';
import type { CompressSettings } from '../../packages/codecs/src/index';
import { fixture } from '../performance/browser';

/** Compare the new contract with the original pipeline, including exact encoded bytes. */
async function verifyCompatEngine() {
  const source = await fixture(120, 80, 'image/png', 'alpha');
  const pool = new WorkerPool(1);
  const processor = createImageProcessor(createCompatImageEngine(() => pool));
  const cases = [];
  try {
    for (const format of ['mozjpeg', 'webp', 'avif', 'oxipng'] as const) {
      for (const mode of ['none', 'contain', 'cover', 'stretch', 'percentage'] as const) {
        const settings: CompressSettings = {
          outputFormat: format,
          quality: 75,
          advanced: {},
          resize: {
            enabled: mode !== 'none',
            mode: mode === 'percentage' ? 'percentage' : 'absolute',
            maxWidth: 64,
            maxHeight: 64,
            percentage: 50,
            method: mode === 'cover' || mode === 'stretch' ? mode : 'contain',
          },
        };
        const decoded = await decodeImage(await source.arrayBuffer());
        const resized = resizeImage(decoded.data, decoded.width, decoded.height, settings.resize!);
        const legacy = await new Promise<ArrayBuffer>((resolve, reject) => {
          pool.enqueue(
            'legacy',
            resized.data.buffer.slice(0) as ArrayBuffer,
            resized.width,
            resized.height,
            source.size,
            settings,
            {
              onResult: (_id, output) => resolve(output),
              onError: (_id, error) => reject(new Error(error)),
            },
          );
        });
        const result = await processor.process({ id: 'engine', source, settings });
        const bytes = new Uint8Array(result.buffer);
        if (
          result.engine !== 'compat' ||
          result.width !== resized.width ||
          result.height !== resized.height ||
          result.originalWidth !== decoded.width ||
          result.originalHeight !== decoded.height ||
          result.originalSize !== source.size ||
          result.outputSize !== bytes.length ||
          bytes.length !== legacy.byteLength ||
          !new Uint8Array(legacy).every((value, i) => value === bytes[i])
        ) {
          throw new Error(`Compatibility parity failed: ${format}/${mode}`);
        }
        cases.push({
          format,
          mode,
          width: result.width,
          height: result.height,
          bytes: bytes.length,
        });
      }
    }
    return { status: 'ok', cases };
  } finally {
    pool.destroy();
  }
}
Object.assign(window, { VipsProbe, getVipsCapabilities, verifyCompatEngine });
