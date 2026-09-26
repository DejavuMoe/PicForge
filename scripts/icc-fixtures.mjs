// A standard sRGB (IEC 61966-2.1) matrix/TRC ICC v4 profile for acceptance checks,
// so an external colour engine (ImageMagick/LCMS) can produce reference sRGB output.
const text = (bytes, at, value) => bytes.set([...value].map((c) => c.charCodeAt(0)), at);

export function srgbIccProfile() {
  const colorants = [
    [0.4360747, 0.2225045, 0.0139322],
    [0.3850649, 0.7168786, 0.0971045],
    [0.1430804, 0.0606169, 0.7141733],
  ];
  const white = [0.9642, 1, 0.8249];
  const curve = [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045];
  const description = 'sRGB acceptance reference';
  const tags = ['desc', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'];
  const descSize = 28 + description.length * 2;
  const xyz = 20;
  const para = 12 + curve.length * 4;
  const tableEnd = 132 + tags.length * 12;
  const offsets = [];
  let at = tableEnd;
  for (const size of [descSize, xyz, xyz, xyz, xyz]) {
    offsets.push(at);
    at += (size + 3) & ~3;
  }
  const paraOffset = at;
  const size = paraOffset + para;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const fixed = (offset, value) => view.setInt32(offset, Math.round(value * 65536));
  view.setUint32(0, size);
  view.setUint32(8, 0x04300000);
  text(bytes, 12, 'mntr');
  text(bytes, 16, 'RGB ');
  text(bytes, 20, 'XYZ ');
  text(bytes, 36, 'acsp');
  white.forEach((value, i) => fixed(68 + i * 4, value));
  view.setUint32(128, tags.length);
  tags.forEach((tag, i) => {
    const entry = 132 + i * 12;
    text(bytes, entry, tag);
    const offset = i < 5 ? offsets[i] : paraOffset;
    view.setUint32(entry + 4, offset);
    view.setUint32(entry + 8, i === 0 ? descSize : i < 5 ? xyz : para);
  });
  text(bytes, offsets[0], 'mluc');
  view.setUint32(offsets[0] + 8, 1);
  view.setUint32(offsets[0] + 12, 12);
  text(bytes, offsets[0] + 16, 'enUS');
  view.setUint32(offsets[0] + 20, description.length * 2);
  view.setUint32(offsets[0] + 24, 28);
  [...description].forEach((c, i) => view.setUint16(offsets[0] + 28 + i * 2, c.charCodeAt(0)));
  [white, ...colorants].forEach((values, i) => {
    text(bytes, offsets[i + 1], 'XYZ ');
    values.forEach((value, k) => fixed(offsets[i + 1] + 8 + k * 4, value));
  });
  text(bytes, paraOffset, 'para');
  view.setUint16(paraOffset + 8, 3);
  curve.forEach((value, k) => fixed(paraOffset + 12 + k * 4, value));
  return Buffer.from(bytes);
}
