import { initializeVips } from '../../packages/worker/src/vips/vipsRuntime.ts';
self.onmessage = async ({ data }) => {
  try {
    const vips = await initializeVips();
    const image = vips.Image.newFromBuffer(data, '', { n: -1, access: 'sequential' });
    try {
      const bytes = new Uint8Array(image.webpsaveBuffer({ Q: 80, effort: 4, keep: 'none' }));
      postMessage({ bytes }, [bytes.buffer]);
    } finally {
      image.delete();
    }
  } catch (error) {
    postMessage({ error: error.message });
  }
};
