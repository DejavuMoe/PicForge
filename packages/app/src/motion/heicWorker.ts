import { encodeImage, DEFAULT_OPTIONS } from '@pic-forge/codecs';

interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    callback: (value: { data: Uint8ClampedArray } | null) => void,
  ): void;
  free(): void;
}
self.onmessage = async ({ data }: MessageEvent<{ buffer: ArrayBuffer; quality: number }>) => {
  try {
    const url = new URL('/wasm/heif-1.23.4-de265-1.1.1/libheif.mjs', self.location.origin).href;
    const { default: createHeif } = await import(/* @vite-ignore */ url);
    const heif = await createHeif();
    // Check the compiled library before any untrusted bytes reach its parser.
    if (heif.heif_get_version() !== '1.23.4' || heif._de265_get_version_number?.() !== 0x01010100)
      throw new Error('engineFailed');
    const images: HeifImage[] = new heif.HeifDecoder().decode(new Uint8Array(data.buffer));
    try {
      const primary = images.find((image) => image.is_primary()) ?? images[0];
      if (!primary) throw new Error('invalidHeic');
      const width = primary.get_width();
      const height = primary.get_height();
      if (width <= 0 || height <= 0 || width * height > 50_000_000)
        throw new Error('tooManyPixels');
      const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
        primary.display(
          { data: new Uint8ClampedArray(width * height * 4), width, height },
          (value) => {
            if (value) resolve(value.data);
            else reject(new Error('invalidHeic'));
          },
        );
      });
      const output = await encodeImage('mozjpeg', rgba, width, height, {
        ...DEFAULT_OPTIONS.mozjpeg,
        quality: data.quality,
      });
      self.postMessage({ output }, { transfer: [output] });
    } finally {
      images.forEach((image) => image.free());
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'invalidHeic' });
  }
};
