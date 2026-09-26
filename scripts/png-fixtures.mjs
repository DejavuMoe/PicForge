// Minimal PNG writer/reader for acceptance checks; no dependency on the app.
import { deflateSync, inflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function pngChunk(type, body = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Non-interlaced grey/truecolour PNG from 8- or 16-bit channel samples; `extra` goes before IDAT. */
export function encodePng(width, height, colorType, depth, samples, extra = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  const perRow = width * CHANNELS[colorType];
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (const value of samples.slice(y * perRow, (y + 1) * perRow)) {
      if (depth === 16) rows.push(value >> 8, value & 255);
      else rows.push(value);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...extra,
    pngChunk('IDAT', deflateSync(Buffer.from(rows))),
    pngChunk('IEND'),
  ]);
}

export function pngChunkTypes(png) {
  const types = [];
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    types.push(png.toString('latin1', at + 4, at + 8));
  }
  return types;
}

/** Decode a non-interlaced grey/truecolour PNG (8/16-bit) to its channel samples. */
export function decodePngSamples(png) {
  let ihdr;
  const idat = [];
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + png.readUInt32BE(at));
    if (type === 'IHDR') ihdr = body;
    if (type === 'IDAT') idat.push(body);
  }
  const [width, height, depth, colorType, interlace] = [
    ihdr.readUInt32BE(0),
    ihdr.readUInt32BE(4),
    ihdr[8],
    ihdr[9],
    ihdr[12],
  ];
  if (!CHANNELS[colorType] || interlace) throw new Error('Unsupported PNG for this reader');
  const bpp = CHANNELS[colorType] * (depth / 8);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let value = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = value & 255;
    }
  }
  const samples = [];
  for (let i = 0; i < px.length; i += depth / 8) {
    samples.push(depth === 16 ? (px[i] << 8) | px[i + 1] : px[i]);
  }
  return { width, height, depth, colorType, samples };
}
