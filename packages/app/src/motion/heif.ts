/**
 * Minimal, bounds-checked HEIF (ISOBMFF) metadata reader for the primary image:
 * its display size (ispe), colour property (colr: ICC profile or nclx) and the
 * location of its Exif item. Pixel decoding stays in libheif; this only reads
 * the small `meta` box so the app can budget memory, keep colours correct and
 * read Apple's Live Photo identifier.
 */

export interface NclxColor {
  primaries: number;
  transfer: number;
  matrix: number;
  fullRange: boolean;
}

export interface HeifColor {
  icc?: Uint8Array;
  nclx?: NclxColor;
}

export interface HeifInfo {
  /** Primary image size before rotation (ispe); undefined if absent. */
  width?: number;
  height?: number;
  color: HeifColor;
  /** Byte range of the Exif item payload in the file, if any. */
  exif?: { offset: number; length: number };
}

interface Box {
  type: string;
  data: number;
  end: number;
}

const MAX_BOXES = 10_000;

class Reader {
  private readonly view: DataView;
  private boxCount = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(at: number) {
    this.check(at, 1);
    return this.bytes[at];
  }
  u16(at: number) {
    this.check(at, 2);
    return this.view.getUint16(at);
  }
  u32(at: number) {
    this.check(at, 4);
    return this.view.getUint32(at);
  }
  uint(at: number, size: number): number {
    if (size === 0) return 0;
    if (size === 4) return this.u32(at);
    if (size === 8) {
      this.check(at, 8);
      const value = Number(this.view.getBigUint64(at));
      if (!Number.isSafeInteger(value)) throw new Error('invalid HEIF');
      return value;
    }
    if (size === 2) return this.u16(at);
    throw new Error('invalid HEIF');
  }
  type(at: number) {
    this.check(at, 4);
    return String.fromCharCode(...this.bytes.subarray(at, at + 4));
  }
  check(at: number, size: number) {
    if (at < 0 || at + size > this.bytes.length) throw new Error('invalid HEIF');
  }

  boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    for (let at = start; at + 8 <= end; ) {
      if (++this.boxCount > MAX_BOXES) throw new Error('invalid HEIF');
      let size = this.u32(at);
      let header = 8;
      if (size === 1) {
        size = this.uint(at + 8, 8);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) throw new Error('invalid HEIF');
      result.push({ type: this.type(at + 4), data: at + header, end: at + size });
      at += size;
    }
    return result;
  }
}

/**
 * Returns null for files that are not structurally valid HEIF with a meta box.
 * `bytes` may be only the start of the file (through the meta box); `fileSize`
 * then bounds the Exif location, which normally lies in mdat.
 */
export function readHeifInfo(bytes: Uint8Array, fileSize = bytes.length): HeifInfo | null {
  try {
    return parse(new Reader(bytes), fileSize);
  } catch {
    return null;
  }
}

/** End offset of the top-level meta box, reading 16-byte headers from a Blob. */
export async function findHeifMetaEnd(source: Blob): Promise<number | undefined> {
  for (let at = 0, count = 0; at + 8 <= source.size && count < 64; count += 1) {
    const header = new DataView(await source.slice(at, at + 16).arrayBuffer());
    let size = header.getUint32(0);
    const type = String.fromCharCode(
      header.getUint8(4),
      header.getUint8(5),
      header.getUint8(6),
      header.getUint8(7),
    );
    if (size === 1 && header.byteLength >= 16) size = Number(header.getBigUint64(8));
    else if (size === 0) size = source.size - at;
    if (!Number.isSafeInteger(size) || size < 8 || at + size > source.size) return undefined;
    if (type === 'meta') return at + size;
    if (count === 0 && type !== 'ftyp') return undefined;
    at += size;
  }
  return undefined;
}

function parse(r: Reader, fileSize: number): HeifInfo | null {
  let meta: Box | undefined;
  for (let at = 0; at + 8 <= r.bytes.length; ) {
    const size = boxSize(r, at);
    if (size < 8) throw new Error('invalid HEIF');
    // A prefix read ends inside mdat; meta precedes it in camera files.
    if (at + size > r.bytes.length) break;
    const [box] = r.boxes(at, at + size);
    if (box.type === 'meta') {
      meta = box;
      break;
    }
    at = box.end;
  }
  if (!meta) return null;
  const children = r.boxes(meta.data + 4, meta.end);
  const child = (type: string) => children.find((box) => box.type === type);

  const pitm = child('pitm');
  if (!pitm) return null;
  const primary = r.u8(pitm.data) === 0 ? r.u16(pitm.data + 4) : r.u32(pitm.data + 4);

  const properties = readProperties(r, child('iprp'));
  const colorOf = (id: number): HeifColor | undefined => {
    const color: HeifColor = {};
    for (const box of properties.get(id) ?? []) {
      if (box.type !== 'colr') continue;
      const kind = r.type(box.data);
      if ((kind === 'prof' || kind === 'rICC') && !color.icc) {
        color.icc = r.bytes.slice(box.data + 4, box.end);
      } else if (kind === 'nclx' && !color.nclx && box.data + 11 <= box.end) {
        color.nclx = {
          primaries: r.u16(box.data + 4),
          transfer: r.u16(box.data + 6),
          matrix: r.u16(box.data + 8),
          fullRange: (r.u8(box.data + 10) & 0x80) !== 0,
        };
      }
    }
    return color.icc || color.nclx ? color : undefined;
  };

  // A grid's colour normally sits on the grid item; fall back to its first tile.
  let color = colorOf(primary);
  if (!color) {
    const tile = readReferences(r, child('iref'), 'dimg').get(primary)?.[0];
    if (tile !== undefined) color = colorOf(tile);
  }

  const ispe = properties.get(primary)?.find((box) => box.type === 'ispe');
  const exifId = findItemOfType(r, child('iinf'), 'Exif');
  return {
    width: ispe ? r.u32(ispe.data + 4) : undefined,
    height: ispe ? r.u32(ispe.data + 8) : undefined,
    color: color ?? {},
    exif:
      exifId === undefined
        ? undefined
        : locateItem(r, child('iloc'), child('idat'), exifId, fileSize),
  };
}

/** Declared size of the top-level box at `at`. */
function boxSize(r: Reader, at: number): number {
  const size = r.u32(at);
  if (size === 1) return r.uint(at + 8, 8);
  if (size === 0) return r.bytes.length - at;
  return size;
}

function readProperties(r: Reader, iprp?: Box): Map<number, Box[]> {
  const result = new Map<number, Box[]>();
  if (!iprp) return result;
  const parts = r.boxes(iprp.data, iprp.end);
  const ipco = parts.find((box) => box.type === 'ipco');
  if (!ipco) return result;
  const properties = r.boxes(ipco.data, ipco.end);
  for (const ipma of parts.filter((box) => box.type === 'ipma')) {
    const version = r.u8(ipma.data);
    const large = (r.u32(ipma.data) & 1) !== 0;
    let at = ipma.data + 4;
    const entries = r.u32(at);
    at += 4;
    for (let i = 0; i < entries; i += 1) {
      const id = version < 1 ? r.u16(at) : r.u32(at);
      at += version < 1 ? 2 : 4;
      const count = r.u8(at);
      at += 1;
      const list = result.get(id) ?? [];
      for (let j = 0; j < count; j += 1) {
        const index = large ? r.u16(at) & 0x7fff : r.u8(at) & 0x7f;
        at += large ? 2 : 1;
        if (index > 0 && properties[index - 1]) list.push(properties[index - 1]);
      }
      result.set(id, list);
      if (at > ipma.end) throw new Error('invalid HEIF');
    }
  }
  return result;
}

function readReferences(r: Reader, iref: Box | undefined, type: string): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (!iref) return result;
  const wide = r.u8(iref.data) !== 0;
  const size = wide ? 4 : 2;
  for (const box of r.boxes(iref.data + 4, iref.end)) {
    if (box.type !== type) continue;
    const from = r.uint(box.data, size);
    const count = r.u16(box.data + size);
    const to: number[] = [];
    for (let i = 0; i < count; i += 1) to.push(r.uint(box.data + size + 2 + i * size, size));
    result.set(from, to);
  }
  return result;
}

function findItemOfType(r: Reader, iinf: Box | undefined, itemType: string): number | undefined {
  if (!iinf) return undefined;
  const header = r.u8(iinf.data) === 0 ? 6 : 8;
  for (const infe of r.boxes(iinf.data + header, iinf.end)) {
    if (infe.type !== 'infe') continue;
    const version = r.u8(infe.data);
    if (version < 2) continue;
    const id = version >= 3 ? r.u32(infe.data + 4) : r.u16(infe.data + 4);
    const typeAt = infe.data + (version >= 3 ? 10 : 8);
    if (r.type(typeAt) === itemType) return id;
  }
  return undefined;
}

function locateItem(
  r: Reader,
  iloc: Box | undefined,
  idat: Box | undefined,
  itemId: number,
  fileSize: number,
): { offset: number; length: number } | undefined {
  if (!iloc) return undefined;
  const version = r.u8(iloc.data);
  let at = iloc.data + 4;
  const sizes = r.u16(at);
  at += 2;
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 15;
  const baseOffsetSize = (sizes >> 4) & 15;
  const indexSize = version >= 1 ? sizes & 15 : 0;
  const count = version < 2 ? r.u16(at) : r.u32(at);
  at += version < 2 ? 2 : 4;
  for (let i = 0; i < count; i += 1) {
    const id = version < 2 ? r.u16(at) : r.u32(at);
    at += version < 2 ? 2 : 4;
    const method = version >= 1 ? r.u16(at) & 15 : 0;
    if (version >= 1) at += 2;
    at += 2; // data_reference_index
    const base = r.uint(at, baseOffsetSize);
    at += baseOffsetSize;
    const extents = r.u16(at);
    at += 2;
    let first: { offset: number; length: number } | undefined;
    for (let j = 0; j < extents; j += 1) {
      at += indexSize;
      const offset = r.uint(at, offsetSize);
      at += offsetSize;
      const length = r.uint(at, lengthSize);
      at += lengthSize;
      if (j === 0) first = { offset: base + offset, length };
    }
    if (id !== itemId || !first || extents !== 1) continue;
    const origin = method === 1 ? idat?.data : method === 0 ? 0 : undefined;
    if (origin === undefined) return undefined;
    const offset = origin + first.offset;
    if (first.length <= 0 || offset + first.length > fileSize) return undefined;
    return { offset, length: first.length };
  }
  return undefined;
}
