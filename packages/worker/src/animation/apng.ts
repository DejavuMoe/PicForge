import { animationError } from './metadata';

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
function checksum(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let p = start; p < end; p++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[p]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** FFmpeg's APNG demuxer cannot start a partial frame in fdAT after a poster.
 * Make the existing poster a 1 ms setup frame disposed to transparent background.
 * The encoder filter MUST discard that frame and reset PTS. No pixels are decoded here.
 * Remove only after the pinned core can decode the poster-partial qualification fixture.
 */
export function normalizeApngPoster(bytes: Uint8Array): Uint8Array {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33) animationError('invalid');
  const output = new Uint8Array(bytes.length + 38);
  const view = new DataView(output.buffer);
  output.set(bytes.subarray(0, 8));
  let to = 8,
    sequence = 0,
    inserted = false;
  for (let at = 8; at < bytes.length;) {
    if (at + 12 > bytes.length) animationError('invalid');
    const size = input.getUint32(at);
    if (
      at + size + 12 > bytes.length ||
      checksum(bytes, at + 4, at + 8 + size) !== input.getUint32(at + 8 + size)
    )
      animationError('invalid');
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (name === 'IDAT' && !inserted) {
      view.setUint32(to, 26);
      output.set([102, 99, 84, 76], to + 4); // fcTL
      view.setUint32(to + 8, sequence++);
      view.setUint32(to + 12, input.getUint32(16));
      view.setUint32(to + 16, input.getUint32(20));
      view.setUint16(to + 28, 1);
      view.setUint16(to + 30, 1000);
      output[to + 32] = 1; // BACKGROUND; clears the entire canvas before the real first frame.
      view.setUint32(to + 34, checksum(output, to + 4, to + 34));
      to += 38;
      inserted = true;
    }
    output.set(bytes.subarray(at, at + size + 12), to);
    if (name === 'acTL') {
      if (size !== 8) animationError('invalid');
      view.setUint32(to + 8, input.getUint32(at + 8) + 1);
    }
    if (name === 'fcTL' || name === 'fdAT') {
      if (!inserted || size < 4) animationError('invalid');
      view.setUint32(to + 8, sequence++);
    }
    if (name === 'acTL' || name === 'fcTL' || name === 'fdAT')
      view.setUint32(to + 8 + size, checksum(output, to + 4, to + 8 + size));
    at += size + 12;
    to += size + 12;
  }
  if (!inserted || to !== output.length) animationError('invalid');
  return output;
}

function pngChunk(name: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(out.length - 4, checksum(out, 4, out.length - 4));
  return out;
}
function join(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  if (size > 100 * 1024 * 1024) animationError('limit');
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** The pinned APNG decoder can lose transparent disposal in non-RGBA formats.
 * Promote *patches*, before animation composition, with the existing PNG codec.
 * Only compressed PNG bytes cross this callback; raw pixels stay inside WASM.
 */
export function promoteApngRgba(
  bytes: Uint8Array,
  encodeRgbaPng: (png: Uint8Array) => Uint8Array,
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = bytes.subarray(0, 8),
    ihdr = bytes.slice(16, 29);
  const ancillary: Uint8Array[] = [];
  let actl: Uint8Array | undefined;
  const frames: { control?: Uint8Array; idat: boolean; payloads: Uint8Array[] }[] = [];
  let current: (typeof frames)[number] | undefined;
  for (let p = 8; p < bytes.length;) {
    if (p + 12 > bytes.length) animationError('invalid');
    const n = view.getUint32(p),
      name = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (
      p + n + 12 > bytes.length ||
      checksum(bytes, p + 4, p + 8 + n) !== view.getUint32(p + 8 + n)
    )
      animationError('invalid');
    const body = bytes.subarray(p + 8, p + 8 + n);
    if (name === 'acTL') actl = body;
    if (['PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB'].includes(name))
      ancillary.push(bytes.subarray(p, p + n + 12));
    if (name === 'fcTL') {
      current = { control: body, idat: false, payloads: [] };
      frames.push(current);
    }
    if (name === 'IDAT' || name === 'fdAT') {
      if (!current) {
        current = { idat: true, payloads: [] };
        frames.push(current);
      }
      if (name === 'IDAT') current.idat = true;
      current.payloads.push(name === 'IDAT' ? body : body.subarray(4));
    }
    p += n + 12;
  }
  if (!actl || !frames.length) animationError('invalid');
  const rgbaHeader = ihdr.slice();
  rgbaHeader[8] = 8;
  rgbaHeader[9] = 6;
  rgbaHeader[12] = 0;
  const parts = [signature, pngChunk('IHDR', rgbaHeader), pngChunk('acTL', actl)];
  let sequence = 0,
    total = parts.reduce((sum, part) => sum + part.length, 0);
  for (const frame of frames) {
    const header = ihdr.slice();
    if (frame.control) header.set(frame.control.subarray(4, 12), 0);
    const png = encodeRgbaPng(
      join([
        signature,
        pngChunk('IHDR', header),
        ...ancillary,
        ...frame.payloads.map((payload) => pngChunk('IDAT', payload)),
        pngChunk('IEND', new Uint8Array()),
      ]),
    );
    if (png.length < 33 || png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
      animationError('output');
    if (frame.control) {
      const control = frame.control.slice();
      new DataView(control.buffer).setUint32(0, sequence++);
      const chunk = pngChunk('fcTL', control);
      parts.push(chunk);
      total += chunk.length;
    }
    const encoded = new DataView(png.buffer, png.byteOffset, png.byteLength);
    for (let p = 8; p < png.length;) {
      if (p + 12 > png.length) animationError('output');
      const n = encoded.getUint32(p);
      if (p + n + 12 > png.length) animationError('output');
      if (String.fromCharCode(...png.subarray(p + 4, p + 8)) === 'IDAT') {
        const payload = png.subarray(p + 8, p + n + 8);
        let body = payload;
        if (!frame.idat) {
          body = new Uint8Array(payload.length + 4);
          new DataView(body.buffer).setUint32(0, sequence++);
          body.set(payload, 4);
        }
        const chunk = pngChunk(frame.idat ? 'IDAT' : 'fdAT', body);
        parts.push(chunk);
        total += chunk.length;
        if (total > 100 * 1024 * 1024) animationError('limit');
      }
      p += n + 12;
    }
  }
  parts.push(pngChunk('IEND', new Uint8Array()));
  return join(parts);
}
