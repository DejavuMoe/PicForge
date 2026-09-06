// Map QuickTime clap coordinates into the autorotated frame. FFmpeg core 0.12.10 predates
// native clap support. Remove this adapter when upgrading to a core with FFmpeg >= 7.1.
interface Box {
  type: string;
  data: number;
  end: number;
}
export function cleanApertureFilters(buffer: ArrayBuffer): string[] | undefined {
  const view = new DataView(buffer);
  const boxes = (start: number, end: number): Box[] => {
    const result: Box[] = [];
    for (let offset = start; offset + 8 <= end; ) {
      let size = view.getUint32(offset);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new Error('videoFailed');
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end)
        throw new Error('videoFailed');
      result.push({
        type: String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4)),
        data: offset + header,
        end: offset + size,
      });
      offset += size;
    }
    return result;
  };
  const child = (parent: Box | undefined, type: string) =>
    parent && boxes(parent.data, parent.end).find((box) => box.type === type);
  const moov = boxes(0, buffer.byteLength).find((box) => box.type === 'moov');
  if (!moov) return;
  for (const track of boxes(moov.data, moov.end).filter((box) => box.type === 'trak')) {
    const mdia = child(track, 'mdia');
    const handler = child(mdia, 'hdlr');
    if (
      !handler ||
      handler.data + 12 > handler.end ||
      view.getUint32(handler.data + 8) !== 0x76696465
    )
      continue;
    const stsd = child(child(child(mdia, 'minf'), 'stbl'), 'stsd');
    if (!stsd || stsd.data + 8 > stsd.end) return;
    const entry = boxes(stsd.data + 8, stsd.end)[0];
    if (!entry || entry.data + 78 > entry.end) return;
    const clap = boxes(entry.data + 78, entry.end).find((box) => box.type === 'clap');
    if (!clap) return;
    if (clap.data + 32 > clap.end) throw new Error('videoFailed');
    const fraction = (offset: number, signed = false) =>
      (signed ? view.getInt32(clap.data + offset) : view.getUint32(clap.data + offset)) /
      view.getUint32(clap.data + offset + 4);
    const width = fraction(0),
      height = fraction(8),
      horizontal = fraction(16, true),
      vertical = fraction(24, true);
    const sourceWidth = view.getUint16(entry.data + 24),
      sourceHeight = view.getUint16(entry.data + 26);
    const x = (sourceWidth - width) / 2 + horizontal,
      y = (sourceHeight - height) / 2 + vertical;
    if (
      ![width, height, x, y].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0 ||
      x < 0 ||
      y < 0 ||
      x + width > sourceWidth ||
      y + height > sourceHeight
    )
      throw new Error('videoFailed');
    let crop = [width, height, x, y];
    const tkhd = child(track, 'tkhd');
    if (!tkhd) throw new Error('videoFailed');
    const matrix = tkhd.data + (view.getUint8(tkhd.data) === 1 ? 52 : 40);
    if (matrix + 20 > tkhd.end) throw new Error('videoFailed');
    const [a, b, c, d] = [0, 4, 12, 16].map((offset) => view.getInt32(matrix + offset) / 65536);
    if (a === 0 && b === 1 && c === -1 && d === 0)
      crop = [height, width, sourceHeight - y - height, x];
    else if (a === 0 && b === -1 && c === 1 && d === 0)
      crop = [height, width, y, sourceWidth - x - width];
    else if (a === -1 && b === 0 && c === 0 && d === -1)
      crop = [width, height, sourceWidth - x - width, sourceHeight - y - height];
    else if (!(a === 1 && b === 0 && c === 0 && d === 1)) throw new Error('videoFailed');
    return [`crop=${crop.map(Math.floor).join(':')}`];
  }
}
