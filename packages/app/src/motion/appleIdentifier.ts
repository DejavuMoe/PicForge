/**
 * Apple's Live Photo pairing key. The still stores it in its Apple MakerNote
 * (tag 0x0011, ContentIdentifier) and the video in its QuickTime metadata key
 * `com.apple.quicktime.content.identifier`. Only small slices of each File are
 * read; failures and missing data return undefined (pairing falls back to names).
 */

import { readMovieBox } from './cleanAperture';
import { findHeifMetaEnd, readHeifInfo } from './heif';

const VIDEO_KEY = 'com.apple.quicktime.content.identifier';
const MAX_EXIF_BYTES = 1024 * 1024;
const MAX_JPEG_SCAN = 256 * 1024;

export async function readLivePhotoIdentifier(file: File): Promise<string | undefined> {
  try {
    if (/\.(heic|heif)$/i.test(file.name)) return await fromHeif(file);
    if (/\.jpe?g$/i.test(file.name)) return await fromJpeg(file);
    if (/\.(mov|mp4)$/i.test(file.name)) return await fromMovie(file);
  } catch {
    // Unreadable metadata is not an error: pairing falls back to filenames.
  }
  return undefined;
}

async function bytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function fromHeif(file: File): Promise<string | undefined> {
  const metaEnd = await findHeifMetaEnd(file);
  if (!metaEnd) return undefined;
  const exif = readHeifInfo(await bytes(file, 0, metaEnd), file.size)?.exif;
  if (!exif || exif.length < 8 || exif.length > MAX_EXIF_BYTES) return undefined;
  const payload = await bytes(file, exif.offset, exif.offset + exif.length);
  // Exif item payload: 4-byte offset to the TIFF header, then the TIFF data.
  const tiffOffset = 4 + new DataView(payload.buffer).getUint32(0);
  return tiffOffset < payload.length ? fromTiff(payload.subarray(tiffOffset)) : undefined;
}

async function fromJpeg(file: File): Promise<string | undefined> {
  const head = await bytes(file, 0, Math.min(file.size, MAX_JPEG_SCAN));
  if (head[0] !== 0xff || head[1] !== 0xd8) return undefined;
  for (let at = 2; at + 4 <= head.length; ) {
    if (head[at] !== 0xff) return undefined;
    const marker = head[at + 1];
    if (marker === 0xda || marker === 0xd9) return undefined; // image data begins
    const length = (head[at + 2] << 8) | head[at + 3];
    if (length < 2) return undefined;
    const exif = String.fromCharCode(...head.subarray(at + 4, at + 10));
    if (marker === 0xe1 && exif === 'Exif\0\0') {
      const segment = await bytes(file, at + 10, at + 2 + length);
      return fromTiff(segment);
    }
    at += 2 + length;
  }
  return undefined;
}

/** Walk TIFF IFD0 → Exif IFD → Apple MakerNote → tag 0x0011. */
function fromTiff(tiff: Uint8Array): string | undefined {
  if (tiff.length < 8) return undefined;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (order !== 'II' && order !== 'MM') return undefined;
  const little = order === 'II';
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const entry = (ifd: number, tag: number) => {
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const at = ifd + 2 + i * 12;
      if (u16(at) === tag) return at;
    }
    return undefined;
  };

  const exifPointer = entry(u32(4), 0x8769);
  if (exifPointer === undefined) return undefined;
  const makerNote = entry(u32(exifPointer + 8), 0x927c);
  if (makerNote === undefined) return undefined;
  const noteLength = u32(makerNote + 4);
  const noteOffset = u32(makerNote + 8);
  if (noteOffset + noteLength > tiff.length) return undefined;
  const note = tiff.subarray(noteOffset, noteOffset + noteLength);
  if (String.fromCharCode(...note.subarray(0, 9)) !== 'Apple iOS') return undefined;

  // Apple MakerNote: "Apple iOS\0", version, byte order, then an IFD at offset 14
  // whose value offsets are relative to the start of the MakerNote.
  const noteView = new DataView(note.buffer, note.byteOffset, note.byteLength);
  const noteLittle = String.fromCharCode(note[12], note[13]) === 'II';
  const count = noteView.getUint16(14, noteLittle);
  for (let i = 0; i < count; i += 1) {
    const at = 16 + i * 12;
    if (at + 12 > note.length) return undefined;
    if (noteView.getUint16(at, noteLittle) !== 0x0011) continue;
    if (noteView.getUint16(at + 2, noteLittle) !== 2) return undefined; // ASCII
    const length = noteView.getUint32(at + 4, noteLittle);
    const start = length <= 4 ? at + 8 : noteView.getUint32(at + 8, noteLittle);
    if (start + length > note.length) return undefined;
    return normalize(note.subarray(start, start + length));
  }
  return undefined;
}

async function fromMovie(file: File): Promise<string | undefined> {
  const moov = await readMovieBox(file);
  if (!moov) return undefined;
  const data = new Uint8Array(moov);
  const view = new DataView(moov);
  const boxes = (start: number, end: number) => {
    const result: Array<{ type: string; data: number; end: number }> = [];
    for (let at = start; at + 8 <= end; ) {
      const size = view.getUint32(at);
      if (size < 8 || at + size > end) return result;
      result.push({
        type: String.fromCharCode(...data.subarray(at + 4, at + 8)),
        data: at + 8,
        end: at + size,
      });
      at += size;
    }
    return result;
  };
  const [root] = boxes(0, data.length);
  if (root?.type !== 'moov') return undefined;
  const meta = boxes(root.data, root.end).find((box) => box.type === 'meta');
  if (!meta) return undefined;
  // QuickTime meta has no version/flags; ISO meta does.
  let children = boxes(meta.data, meta.end);
  if (!children.some((box) => box.type === 'keys')) children = boxes(meta.data + 4, meta.end);
  const keys = children.find((box) => box.type === 'keys');
  const ilst = children.find((box) => box.type === 'ilst');
  if (!keys || !ilst) return undefined;

  const names: string[] = [];
  const entries = view.getUint32(keys.data + 4);
  for (let at = keys.data + 8, i = 0; i < entries && at + 8 <= keys.end; i += 1) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > keys.end) break;
    names.push(String.fromCharCode(...data.subarray(at + 8, at + size)));
    at += size;
  }
  const index = names.indexOf(VIDEO_KEY) + 1;
  if (index === 0) return undefined;
  for (const item of boxes(ilst.data, ilst.end)) {
    if (view.getUint32(item.data - 4) !== index) continue;
    const value = boxes(item.data, item.end).find((box) => box.type === 'data');
    // data box: type indicator (1 = UTF-8), locale, then the value.
    if (!value || value.data + 8 > value.end || view.getUint32(value.data) !== 1) return undefined;
    return normalize(data.subarray(value.data + 8, value.end));
  }
  return undefined;
}

function normalize(value: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(value).replace(/\0+$/, '').trim().toUpperCase();
  return /^[0-9A-F-]{8,}$/.test(text) ? text : undefined;
}
