// Generated non-personal fixtures. Nothing decoded or exported is kept in the repository.
import { deflateSync } from 'node:zlib';
export function chunk(name, data) {
  const body = Buffer.concat([Buffer.from(name), data]);
  let crc = 0xffffffff;
  for (const b of body) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
export function apng({
  width = 16,
  height = 12,
  plays = 3,
  poster = false,
  frames,
  extra = [],
  colorType = 6,
}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length);
  actl.writeUInt32BE(plays, 4);
  const parts = [
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('acTL', actl),
  ];
  const pixels = (f) => {
    const w = f.width ?? width,
      h = f.height ?? height;
    const channels = colorType === 2 ? 3 : 4;
    const raw = Buffer.alloc((w * channels + 1) * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const color = typeof f.color === 'function' ? f.color(x, y) : f.color;
        raw.set(color.slice(0, channels), y * (w * channels + 1) + 1 + x * channels);
      }
    return deflateSync(raw);
  };
  if (poster) parts.push(chunk('IDAT', pixels({ color: [255, 0, 255, 255] })));
  let sequence = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i],
      fc = Buffer.alloc(26);
    fc.writeUInt32BE(sequence++);
    fc.writeUInt32BE(f.width ?? width, 4);
    fc.writeUInt32BE(f.height ?? height, 8);
    fc.writeUInt32BE(f.x ?? 0, 12);
    fc.writeUInt32BE(f.y ?? 0, 16);
    fc.writeUInt16BE(f.delay ?? 100, 20);
    fc.writeUInt16BE(f.denominator ?? 1000, 22);
    fc[24] = f.dispose ?? 0;
    fc[25] = f.blend ?? 0;
    parts.push(chunk('fcTL', fc));
    if (!i && !poster) parts.push(chunk('IDAT', pixels(f)));
    else {
      const seq = Buffer.alloc(4);
      seq.writeUInt32BE(sequence++);
      parts.push(chunk('fdAT', Buffer.concat([seq, pixels(f)])));
    }
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
export const variableFrames = [
  { color: [255, 0, 0, 255], delay: 70 },
  { color: [0, 255, 0, 255], delay: 130 },
  { color: [0, 0, 255, 255], delay: 240 },
];
export const disposalFrames = [
  { color: [255, 0, 0, 255], delay: 70 },
  { color: [0, 255, 0, 128], width: 6, height: 4, x: 2, y: 2, blend: 1, dispose: 2, delay: 130 },
  { color: [0, 0, 255, 255], width: 5, height: 5, x: 7, y: 3, dispose: 1, delay: 240 },
  { color: [255, 255, 0, 255], width: 3, height: 3, x: 0, y: 0, delay: 90 },
];
