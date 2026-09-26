/**
 * Minimal QuickTime/ISO-BMFF movie reader for the WebCodecs Live Photo path: track
 * headers, sample entries and sample tables, so encoded samples can be decoded with
 * the same presentation times FFmpeg reports for the source. Anything outside this
 * subset throws `unsupportedMovie`; the caller then converts with FFmpeg instead.
 */

export const UNSUPPORTED_MOVIE = 'unsupportedMovie';
/** Bounds a hostile or corrupt sample table before any allocation. */
const MAX_SAMPLES = 2_000_000;
const MAX_BOXES = 100_000;

interface Box {
  type: string;
  data: number;
  end: number;
}

export interface MovieTrack {
  id: number;
  /** Media handler: `vide`, `soun`, `auxv`, `meta`, … */
  handler: string;
  timescale: number;
  /** Sample entry four-character code (`hvc1`, `avc1`, `lpcm`, `mp4a`, …). */
  format: string;
  /** Sample entry payload after its 8-byte box header. */
  entry: Uint8Array;
  /** Child boxes of the sample entry by type (`hvcC`, `colr`, `clap`, `esds`, `wave`, …). */
  children: Record<string, Uint8Array>;
  width: number;
  height: number;
  /** tkhd matrix a, b, c, d (16.16 values as numbers). */
  matrix: [number, number, number, number];
  /** Parsed on demand, so an unusual metadata track never blocks the others. */
  samples(): SampleTable;
}

export interface SampleTable {
  count: number;
  offsets: Float64Array;
  sizes: Uint32Array;
  dts: Float64Array;
  /** Presentation times after the edit list, in media timescale units (may be negative). */
  pts: Float64Array;
  /** Presentation shift from the edit list; negative for encoder priming. */
  edit: number;
  /** Presentation end set by the edit list, when there is one. */
  end?: number;
  durations: Uint32Array;
  sync: Uint8Array;
}

export interface Movie {
  timescale: number;
  tracks: MovieTrack[];
}

function fail(): never {
  throw new Error(UNSUPPORTED_MOVIE);
}

export function readBoxes(view: DataView, start: number, end: number): Box[] {
  const result: Box[] = [];
  for (let offset = start; offset + 8 <= end;) {
    if (result.length > MAX_BOXES) fail();
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) fail();
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) fail();
    result.push({
      type: String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
      ),
      data: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return result;
}

/** Visual and sound sample entries carry fixed fields before their child boxes. */
function entryChildrenOffset(view: DataView, handler: string, entry: Box): number | undefined {
  if (handler === 'vide' || handler === 'auxv') return 78;
  if (handler !== 'soun' || entry.data + 10 > entry.end) return undefined;
  const version = view.getUint16(entry.data + 8);
  return version === 0 ? 28 : version === 1 ? 44 : version === 2 ? 64 : undefined;
}

export function parseMovie(buffer: ArrayBuffer): Movie {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const child = (parent: Box | undefined, type: string) =>
    parent ? readBoxes(view, parent.data, parent.end).find((box) => box.type === type) : undefined;
  const moov = readBoxes(view, 0, buffer.byteLength).find((box) => box.type === 'moov');
  if (!moov) fail();
  const mvhd = child(moov, 'mvhd');
  if (!mvhd) fail();
  const movieTimescale = view.getUint32(mvhd.data + (view.getUint8(mvhd.data) === 1 ? 20 : 12));
  if (!movieTimescale) fail();

  const tracks: MovieTrack[] = [];
  for (const trak of readBoxes(view, moov.data, moov.end).filter((box) => box.type === 'trak')) {
    const tkhd = child(trak, 'tkhd');
    const mdia = child(trak, 'mdia');
    const mdhd = child(mdia, 'mdhd');
    const hdlr = child(mdia, 'hdlr');
    const stbl = child(child(mdia, 'minf'), 'stbl');
    if (!tkhd || !mdhd || !hdlr || !stbl || hdlr.data + 12 > hdlr.end) fail();
    const handler = String.fromCharCode(...bytes.subarray(hdlr.data + 8, hdlr.data + 12));
    const v1 = view.getUint8(tkhd.data) === 1;
    const id = view.getUint32(tkhd.data + (v1 ? 20 : 12));
    const matrixAt = tkhd.data + (v1 ? 52 : 40);
    if (matrixAt + 36 > tkhd.end) fail();
    const matrix = [0, 4, 12, 16].map((offset) => view.getInt32(matrixAt + offset) / 65536) as [
      number,
      number,
      number,
      number,
    ];
    const timescale = view.getUint32(mdhd.data + (view.getUint8(mdhd.data) === 1 ? 20 : 12));
    if (!timescale) fail();

    const stsd = child(stbl, 'stsd');
    if (!stsd || stsd.data + 8 > stsd.end) fail();
    const entries = readBoxes(view, stsd.data + 8, stsd.end);
    const entry = entries[0];
    if (!entry) fail();
    const children: Record<string, Uint8Array> = {};
    const childAt = entryChildrenOffset(view, handler, entry);
    if (childAt !== undefined && entry.data + childAt <= entry.end)
      for (const box of readBoxes(view, entry.data + childAt, entry.end))
        children[box.type] ??= bytes.slice(box.data, box.end);
    const visual = handler === 'vide' || handler === 'auxv';
    if (visual && entry.data + 28 > entry.end) fail();

    let parsed: SampleTable | undefined;
    const samples = () => {
      if (parsed) return parsed;
      const table = sampleTable(view, stbl, child, entries.length);
      const edit = editList(view, child(child(trak, 'edts'), 'elst'), timescale, movieTimescale);
      const pts = new Float64Array(table.count);
      for (let index = 0; index < table.count; index += 1) {
        pts[index] = table.dts[index] + table.composition[index] + edit.shift;
      }
      parsed = { ...table, pts, edit: edit.shift, end: edit.end };
      return parsed;
    };
    tracks.push({
      id,
      handler,
      timescale,
      format: entry.type,
      entry: bytes.slice(entry.data, entry.end),
      children,
      width: visual ? view.getUint16(entry.data + 24) : 0,
      height: visual ? view.getUint16(entry.data + 26) : 0,
      matrix,
      samples,
    });
  }
  return { timescale: movieTimescale, tracks };
}

function sampleTable(
  view: DataView,
  stbl: Box,
  child: (parent: Box | undefined, type: string) => Box | undefined,
  entryCount: number,
) {
  // One sample description only: a mid-stream format change is FFmpeg's job.
  if (entryCount !== 1) fail();
  const stsz = child(stbl, 'stsz');
  const stts = child(stbl, 'stts');
  const stsc = child(stbl, 'stsc');
  const stco = child(stbl, 'stco');
  const co64 = child(stbl, 'co64');
  if (!stsz || !stts || !stsc || (!stco && !co64)) fail();

  const constant = view.getUint32(stsz.data + 4);
  const count = view.getUint32(stsz.data + 8);
  if (count > MAX_SAMPLES || (!constant && stsz.data + 12 + count * 4 > stsz.end)) fail();
  const sizes = new Uint32Array(count);
  for (let index = 0; index < count; index += 1)
    sizes[index] = constant || view.getUint32(stsz.data + 12 + index * 4);

  const chunkBox = (stco ?? co64)!;
  const chunkCount = view.getUint32(chunkBox.data + 4);
  const wide = !stco;
  if (chunkBox.data + 8 + chunkCount * (wide ? 8 : 4) > chunkBox.end) fail();
  const chunkOffset = (index: number) =>
    wide
      ? Number(view.getBigUint64(chunkBox.data + 8 + index * 8))
      : view.getUint32(chunkBox.data + 8 + index * 4);

  const runs = view.getUint32(stsc.data + 4);
  if (!runs || stsc.data + 8 + runs * 12 > stsc.end) fail();
  const offsets = new Float64Array(count);
  let sample = 0;
  for (let run = 0; run < runs; run += 1) {
    const at = stsc.data + 8 + run * 12;
    const first = view.getUint32(at) - 1;
    const perChunk = view.getUint32(at + 4);
    const last = run + 1 < runs ? view.getUint32(at + 12) - 1 : chunkCount;
    if (first < 0 || last > chunkCount || last < first || view.getUint32(at + 8) !== 1) fail();
    for (let chunk = first; chunk < last && sample < count; chunk += 1) {
      let offset = chunkOffset(chunk);
      for (let index = 0; index < perChunk && sample < count; index += 1) {
        offsets[sample] = offset;
        offset += sizes[sample];
        sample += 1;
      }
    }
  }
  if (sample !== count) fail();

  const dts = new Float64Array(count);
  const durations = new Uint32Array(count);
  const timeRuns = view.getUint32(stts.data + 4);
  if (stts.data + 8 + timeRuns * 8 > stts.end) fail();
  let time = 0;
  sample = 0;
  for (let run = 0; run < timeRuns; run += 1) {
    const samples = view.getUint32(stts.data + 8 + run * 8);
    const delta = view.getUint32(stts.data + 12 + run * 8);
    for (let index = 0; index < samples && sample < count; index += 1) {
      dts[sample] = time;
      durations[sample] = delta;
      time += delta;
      sample += 1;
    }
  }
  if (sample !== count) fail();

  // QuickTime writes signed offsets even in version 0; FFmpeg reads them signed too.
  const composition = new Float64Array(count);
  const ctts = child(stbl, 'ctts');
  if (ctts) {
    const offsetRuns = view.getUint32(ctts.data + 4);
    if (ctts.data + 8 + offsetRuns * 8 > ctts.end) fail();
    sample = 0;
    for (let run = 0; run < offsetRuns; run += 1) {
      const samples = view.getUint32(ctts.data + 8 + run * 8);
      const offset = view.getInt32(ctts.data + 12 + run * 8);
      for (let index = 0; index < samples && sample < count; index += 1)
        composition[sample++] = offset;
    }
    if (sample !== count) fail();
  }

  const sync = new Uint8Array(count);
  const stss = child(stbl, 'stss');
  if (!stss) sync.fill(1);
  else {
    const syncCount = view.getUint32(stss.data + 4);
    if (stss.data + 8 + syncCount * 4 > stss.end) fail();
    for (let index = 0; index < syncCount; index += 1) {
      const number = view.getUint32(stss.data + 8 + index * 4);
      if (number >= 1 && number <= count) sync[number - 1] = 1;
    }
  }
  return { count, sizes, offsets, dts, durations, composition, sync };
}

/**
 * Presentation shift of the edit list and the presentation end it sets, in media
 * units. Supported: no edits, one normal edit, or one empty edit followed by one
 * normal edit — what cameras write.
 */
function editList(
  view: DataView,
  elst: Box | undefined,
  timescale: number,
  movieTimescale: number,
): { shift: number; end?: number } {
  if (!elst) return { shift: 0 };
  const version = view.getUint8(elst.data);
  const count = view.getUint32(elst.data + 4);
  const size = version === 1 ? 20 : 12;
  if (elst.data + 8 + count * size > elst.end) fail();
  const edits = Array.from({ length: count }, (_, index) => {
    const at = elst.data + 8 + index * size;
    const duration = version === 1 ? Number(view.getBigUint64(at)) : view.getUint32(at);
    const mediaTime = version === 1 ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
    const rate = view.getInt32(at + (version === 1 ? 16 : 8));
    return { duration, mediaTime, rate };
  });
  let empty = 0;
  if (edits[0]?.mediaTime === -1) empty = (edits.shift()!.duration * timescale) / movieTimescale;
  if (edits.length === 0) return { shift: empty };
  if (edits.length !== 1 || edits[0].mediaTime < 0 || edits[0].rate !== 0x10000) fail();
  return {
    shift: empty - edits[0].mediaTime,
    end: empty + (edits[0].duration * timescale) / movieTimescale,
  };
}

export interface VideoTrackInfo {
  /** WebCodecs codec string, for example `hvc1.1.6.L120.B0` or `avc1.640028`. */
  codec: string;
  description: Uint8Array;
  bitDepth: number;
  /** ISO/IEC 23091-2 code points from `colr`, when present. */
  colour?: { primaries: number; transfer: number; matrix: number; fullRange?: boolean };
  /** QuickTime clean aperture in source pixels. */
  clap?: { width: number; height: number; horizontal: number; vertical: number };
  /** Clockwise display rotation from the track matrix. */
  rotation: 0 | 90 | 180 | 270;
}

const hex = (value: number) => value.toString(16).toUpperCase();

export function videoTrackInfo(track: MovieTrack): VideoTrackInfo {
  const hevc = track.format === 'hvc1' || track.format === 'hev1';
  const description = hevc ? track.children.hvcC : track.children.avcC;
  if (!description || !(hevc || track.format === 'avc1' || track.format === 'avc3')) fail();
  let codec: string;
  let bitDepth = 8;
  if (hevc) {
    if (description.length < 23) fail();
    const space = description[1] >> 6;
    const tier = (description[1] >> 5) & 1;
    const profile = description[1] & 31;
    let compatibility =
      ((description[2] << 24) | (description[3] << 16) | (description[4] << 8) | description[5]) >>>
      0;
    let reversed = 0;
    for (let bit = 0; bit < 32; bit += 1, compatibility >>>= 1)
      reversed = ((reversed << 1) | (compatibility & 1)) >>> 0;
    const constraints = Array.from(description.subarray(6, 12));
    while (constraints.length && constraints.at(-1) === 0) constraints.pop();
    codec = [
      track.format,
      `${space ? String.fromCharCode(64 + space) : ''}${profile}`,
      hex(reversed),
      `${tier ? 'H' : 'L'}${description[12]}`,
      ...constraints.map(hex),
    ].join('.');
    if ((description[16] & 3) !== 1) fail(); // 4:2:0 only
    bitDepth = (description[17] & 7) + 8;
  } else {
    if (description.length < 4) fail();
    // High 10/4:2:2/4:4:4 profiles are not 8-bit 4:2:0.
    if ([110, 122, 244, 44].includes(description[1])) fail();
    codec = `${track.format}.${[1, 2, 3].map((index) => description[index].toString(16).padStart(2, '0')).join('')}`;
  }

  let colour: VideoTrackInfo['colour'];
  const colr = track.children.colr;
  if (colr && colr.length >= 10) {
    const kind = String.fromCharCode(...colr.subarray(0, 4));
    const read = (offset: number) => (colr[offset] << 8) | colr[offset + 1];
    if (kind === 'nclc' || kind === 'nclx')
      colour = {
        primaries: read(4),
        transfer: read(6),
        matrix: read(8),
        fullRange: kind === 'nclx' && colr.length >= 11 ? (colr[10] & 0x80) !== 0 : undefined,
      };
  }

  let clap: VideoTrackInfo['clap'];
  const box = track.children.clap;
  if (box) {
    if (box.length < 32) fail();
    const view = new DataView(box.buffer, box.byteOffset, box.byteLength);
    const fraction = (offset: number, signed = false) =>
      (signed ? view.getInt32(offset) : view.getUint32(offset)) / view.getUint32(offset + 4);
    clap = {
      width: fraction(0),
      height: fraction(8),
      horizontal: fraction(16, true),
      vertical: fraction(24, true),
    };
    if (!Object.values(clap).every(Number.isFinite) || clap.width <= 0 || clap.height <= 0) fail();
  }

  const [a, b, c, d] = track.matrix;
  const rotation =
    a === 1 && b === 0 && c === 0 && d === 1
      ? 0
      : a === 0 && b === 1 && c === -1 && d === 0
        ? 90
        : a === -1 && b === 0 && c === 0 && d === -1
          ? 180
          : a === 0 && b === -1 && c === 1 && d === 0
            ? 270
            : fail();
  return { codec, description, bitDepth, colour, clap, rotation };
}

export interface AacFormat {
  codec: string;
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig. */
  description: Uint8Array;
}

/** AAC `mp4a` entries, with the ES descriptor directly or inside a QuickTime `wave` box. */
export function aacFormat(track: MovieTrack): AacFormat | undefined {
  if (track.format !== 'mp4a') return undefined;
  let esds = track.children.esds;
  const wave = track.children.wave;
  if (!esds && wave) {
    const view = new DataView(wave.buffer, wave.byteOffset, wave.byteLength);
    const box = readBoxes(view, 0, wave.byteLength).find((entry) => entry.type === 'esds');
    if (box) esds = wave.slice(box.data, box.end);
  }
  if (!esds || esds.length < 5) return undefined;
  // Walk ES_Descriptor (3) → DecoderConfigDescriptor (4) → DecoderSpecificInfo (5).
  let at = 4;
  const descriptor = () => {
    const tag = esds[at++];
    let length = 0;
    for (let index = 0; index < 4; index += 1) {
      const byte = esds[at++];
      length = (length << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return { tag, length };
  };
  if (descriptor().tag !== 3) return undefined;
  const flags = esds[at + 2];
  at += 3 + (flags & 0x80 ? 2 : 0);
  if (flags & 0x40) at += 1 + esds[at];
  if (flags & 0x20) at += 2;
  if (descriptor().tag !== 4) return undefined;
  const objectType = esds[at];
  if (objectType !== 0x40 && objectType !== 0x67) return undefined;
  at += 13;
  const info = descriptor();
  if (info.tag !== 5 || at + info.length > esds.length || info.length < 2) return undefined;
  const description = esds.slice(at, at + info.length);
  const audioObjectType = description[0] >> 3;
  const rates = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
  ];
  const rateIndex = ((description[0] & 7) << 1) | (description[1] >> 7);
  const channels = (description[1] >> 3) & 15;
  if (audioObjectType === 31 || rateIndex >= rates.length || !channels) return undefined;
  return {
    codec: `mp4a.40.${audioObjectType}`,
    sampleRate: rates[rateIndex],
    channels,
    description,
  };
}
