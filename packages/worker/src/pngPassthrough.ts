/**
 * PNG → PNG without resizing can skip the Canvas decode. The Canvas path renders
 * into 8-bit premultiplied sRGB and reads back RGBA, which loses 16-bit samples,
 * rounds semi-transparent colours and costs a main-thread decode. Handing the
 * original compressed image data to OxiPNG is exact instead.
 *
 * The output must keep the Canvas path's semantics:
 * - Pixels render the same: files whose colour, orientation or animation chunks
 *   the browser would apply (ICC, gamma/chromaticities without sRGB, cICP, HDR
 *   metadata, eXIf, APNG) are left to the Canvas path.
 * - No metadata is exported: only IHDR, PLTE, IDAT and IEND are copied.
 *   (jSquash OxiPNG keeps every ancillary chunk it is given, including text and
 *   eXIf, so this filter is required.)
 * - Only images that cannot be transparent qualify. The Canvas path clears colours
 *   hidden under fully transparent pixels; OxiPNG's alpha optimisation cannot
 *   guarantee that, because it returns its input unchanged whenever it cannot make
 *   the file smaller. Alpha colour types and tRNS therefore use the Canvas path.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const COPIED = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
/** Grey, truecolour and indexed colour; alpha types (4, 6) use the Canvas path. */
const OPAQUE_COLOR_TYPES = new Set([0, 2, 3]);
/** Chunks that change how the browser renders pixels, add transparency, or animate them. */
const RENDERING = new Set([
  'tRNS',
  'iCCP',
  'cICP',
  'mDCv',
  'cLLi',
  'eXIf',
  'acTL',
  'fcTL',
  'fdAT',
]);
/** Only neutral when an sRGB chunk overrides them. */
const GAMMA = new Set(['gAMA', 'cHRM']);

export interface PngPassthrough {
  png: ArrayBuffer;
  width: number;
  height: number;
}

export function isPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((value, index) => bytes[index] === value);
}

/**
 * Return sanitized PNG bytes, or null when the file must use the Canvas path
 * (unsupported semantics, invalid structure or anything unexpected).
 */
export function preparePngPassthrough(bytes: Uint8Array): PngPassthrough | null {
  if (!isPngSignature(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Array<[number, number]> = [];
  const seen = new Set<string>();
  let width = 0;
  let height = 0;
  let colorType: number;
  let ended = false;

  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (length > 0x7fffffff || end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (kept.length === 0) {
      if (type !== 'IHDR' || length !== 13) return null;
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      colorType = bytes[at + 17];
      if (!OPAQUE_COLOR_TYPES.has(colorType)) return null;
      if (bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || bytes[at + 20] > 1) return null;
    }
    seen.add(type);
    if (COPIED.has(type)) kept.push([at, end]);
    else if (type[0] === type[0].toUpperCase()) return null; // unknown critical chunk
    at = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }

  if (!ended || !seen.has('IDAT') || width < 1 || height < 1) return null;
  if ([...RENDERING].some((type) => seen.has(type))) return null;
  if ([...GAMMA].some((type) => seen.has(type)) && !seen.has('sRGB')) return null;

  const size = 8 + kept.reduce((sum, [start, end]) => sum + end - start, 0);
  const output = new Uint8Array(size);
  output.set(SIGNATURE, 0);
  let offset = 8;
  for (const [start, end] of kept) {
    output.set(bytes.subarray(start, end), offset);
    offset += end - start;
  }
  return { png: output.buffer, width, height };
}

/** Read a PNG Blob for the passthrough; non-PNG sources are rejected after 8 bytes. */
export async function readPngPassthrough(source: Blob): Promise<PngPassthrough | null> {
  if (!isPngSignature(new Uint8Array(await source.slice(0, 8).arrayBuffer()))) return null;
  return preparePngPassthrough(new Uint8Array(await source.arrayBuffer()));
}
