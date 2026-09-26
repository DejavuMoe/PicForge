/**
 * Minimal MP4 writer for the WebCodecs Live Photo path: one H.264 track and an
 * optional AAC track, `moov` first (fast start), no metadata. Presentation times
 * are written exactly (ctts and an edit list only when they are needed), so the
 * output reports the same per-frame times as the source.
 */

export interface MuxSample {
  data: Uint8Array;
  /** Presentation time in the track timescale. */
  pts: number;
  sync: boolean;
}

export interface MuxVideoTrack {
  width: number;
  height: number;
  timescale: number;
  /** avcC from the encoder's decoder config. */
  description: Uint8Array;
  colour?: { primaries: number; transfer: number; matrix: number; fullRange: boolean };
  /** Samples in decode order. */
  samples: MuxSample[];
  /** Duration of the last frame in presentation order. */
  lastDuration: number;
}

export interface MuxAudioTrack {
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig. */
  description: Uint8Array;
  /** Samples (AAC access units) in order; timescale is the sample rate. */
  samples: Array<{ data: Uint8Array; duration: number }>;
  /** Encoder priming to skip, in samples. */
  priming?: number;
  /** Samples to present after the priming (trims encoder padding). */
  length?: number;
}

class Writer {
  private chunks: Uint8Array[] = [];
  length = 0;
  bytes(data: Uint8Array | number[]) {
    const chunk = data instanceof Uint8Array ? data : Uint8Array.from(data);
    this.chunks.push(chunk);
    this.length += chunk.length;
    return this;
  }
  u8(value: number) {
    return this.bytes([value & 255]);
  }
  u16(value: number) {
    return this.bytes([(value >> 8) & 255, value & 255]);
  }
  u32(value: number) {
    return this.bytes([(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255]);
  }
  i32(value: number) {
    return this.u32(value >>> 0);
  }
  text(value: string) {
    return this.bytes(Array.from(value, (char) => char.charCodeAt(0)));
  }
  zeros(count: number) {
    return this.bytes(new Uint8Array(count));
  }
  finish(): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const writer = new Writer();
  const size = parts.reduce((total, part) => total + part.length, 8);
  writer.u32(size).text(type);
  for (const part of parts) writer.bytes(part);
  return writer.finish();
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]) {
  const header = new Writer()
    .u8(version)
    .bytes([(flags >> 16) & 255, (flags >> 8) & 255, flags & 255]);
  return box(type, header.finish(), ...parts);
}

const build = (fill: (writer: Writer) => void) => {
  const writer = new Writer();
  fill(writer);
  return writer.finish();
};

const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

function mvhd(timescale: number, duration: number, nextTrack: number) {
  return fullBox(
    'mvhd',
    0,
    0,
    build((w) => {
      w.u32(0).u32(0).u32(timescale).u32(duration).u32(0x10000).u16(0x100).zeros(10);
      for (const value of MATRIX) w.u32(value);
      w.zeros(24).u32(nextTrack);
    }),
  );
}

function tkhd(id: number, duration: number, audio: boolean, width = 0, height = 0) {
  return fullBox(
    'tkhd',
    0,
    3,
    build((w) => {
      w.u32(0).u32(0).u32(id).u32(0).u32(duration).zeros(8).u16(0).u16(0);
      w.u16(audio ? 0x100 : 0).u16(0);
      for (const value of MATRIX) w.u32(value);
      w.u32(width * 65536).u32(height * 65536);
    }),
  );
}

function elst(entries: Array<{ duration: number; mediaTime: number }>) {
  return box(
    'edts',
    fullBox(
      'elst',
      0,
      0,
      build((w) => {
        w.u32(entries.length);
        for (const entry of entries) w.u32(entry.duration).i32(entry.mediaTime).u32(0x10000);
      }),
    ),
  );
}

function mdhd(timescale: number, duration: number) {
  // Language `und`.
  return fullBox(
    'mdhd',
    0,
    0,
    build((w) => w.u32(0).u32(0).u32(timescale).u32(duration).u16(0x55c4).u16(0)),
  );
}

function hdlr(handler: string, name: string) {
  return fullBox(
    'hdlr',
    0,
    0,
    build((w) => w.u32(0).text(handler).zeros(12).text(name).u8(0)),
  );
}

const dinf = () =>
  box(
    'dinf',
    fullBox(
      'dref',
      0,
      0,
      build((w) => w.u32(1)),
      fullBox('url ', 0, 1),
    ),
  );

function runs(values: number[]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const value of values) {
    const last = result.at(-1);
    if (last && last[1] === value) last[0] += 1;
    else result.push([1, value]);
  }
  return result;
}

interface Chunk {
  count: number;
  offset: number;
}

function stbl(
  entry: Uint8Array,
  durations: number[],
  sizes: number[],
  chunks: Chunk[],
  extra: Uint8Array[],
) {
  const stts = fullBox(
    'stts',
    0,
    0,
    build((w) => {
      const entries = runs(durations);
      w.u32(entries.length);
      for (const [count, delta] of entries) w.u32(count).u32(delta);
    }),
  );
  const stsc = fullBox(
    'stsc',
    0,
    0,
    build((w) => {
      const entries = chunks.flatMap((chunk, index) =>
        index > 0 && chunks[index - 1].count === chunk.count ? [] : [[index + 1, chunk.count]],
      );
      w.u32(entries.length);
      for (const [first, count] of entries) w.u32(first).u32(count).u32(1);
    }),
  );
  const stsz = fullBox(
    'stsz',
    0,
    0,
    build((w) => {
      w.u32(0).u32(sizes.length);
      for (const size of sizes) w.u32(size);
    }),
  );
  const stco = fullBox(
    'stco',
    0,
    0,
    build((w) => {
      w.u32(chunks.length);
      for (const chunk of chunks) w.u32(chunk.offset);
    }),
  );
  return box(
    'stbl',
    fullBox(
      'stsd',
      0,
      0,
      build((w) => w.u32(1)),
      entry,
    ),
    stts,
    ...extra,
    stsc,
    stsz,
    stco,
  );
}

function avc1(track: MuxVideoTrack) {
  const children = [box('avcC', track.description)];
  if (track.colour)
    children.push(
      box(
        'colr',
        build((w) => {
          w.text('nclx')
            .u16(track.colour!.primaries)
            .u16(track.colour!.transfer)
            .u16(track.colour!.matrix);
          w.u8(track.colour!.fullRange ? 0x80 : 0);
        }),
      ),
    );
  children.push(
    box(
      'pasp',
      build((w) => w.u32(1).u32(1)),
    ),
  );
  return box(
    'avc1',
    build((w) => {
      w.zeros(6).u16(1).zeros(16).u16(track.width).u16(track.height);
      w.u32(0x480000).u32(0x480000).u32(0).u16(1).zeros(32).u16(0x18).u16(0xffff);
    }),
    ...children,
  );
}

function descriptor(tag: number, ...parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  return build((w) => {
    w.u8(tag)
      .u8(0x80 | ((length >> 21) & 127))
      .u8(0x80 | ((length >> 14) & 127));
    w.u8(0x80 | ((length >> 7) & 127)).u8(length & 127);
    for (const part of parts) w.bytes(part);
  });
}

function mp4a(track: MuxAudioTrack, bitrate: number) {
  const esds = fullBox(
    'esds',
    0,
    0,
    descriptor(
      3,
      build((w) => w.u16(1).u8(0)),
      descriptor(
        4,
        build((w) => w.u8(0x40).u8(0x15).bytes([0, 0, 0]).u32(bitrate).u32(bitrate)),
        descriptor(5, track.description),
      ),
      descriptor(6, Uint8Array.of(2)),
    ),
  );
  return box(
    'mp4a',
    build((w) => {
      w.zeros(6).u16(1).zeros(8).u16(track.channels).u16(16).u16(0).u16(0);
      w.u32(track.sampleRate < 65536 ? track.sampleRate * 65536 : 0);
    }),
    esds,
  );
}

/**
 * Presentation layout for samples in decode order: file decode times are the sorted
 * presentation times, composition offsets restore reordering, and an edit list
 * restores a non-zero first time or the reordering delay.
 */
export function videoTiming(pts: number[], lastDuration: number) {
  const sorted = [...pts].sort((a, b) => a - b);
  const delay = Math.max(0, ...pts.map((value, index) => sorted[index] - value));
  const composition = pts.map((value, index) => value - sorted[index] + delay);
  const durations = sorted.map((value, index) =>
    index + 1 < sorted.length ? sorted[index + 1] - value : lastDuration,
  );
  const start = sorted[0] ?? 0;
  const mediaDuration = durations.reduce((total, value) => total + value, 0);
  return { composition, durations, start, delay, mediaDuration };
}

/**
 * Chunk order for the mdat: tracks alternate in runs of at most `span` seconds of
 * decode time, as FFmpeg does, so a reader never has to jump to the end of the file
 * for the other track.
 */
export function interleave(times: number[][], span = 0.5) {
  const next = times.map(() => 0);
  const order: Array<{ track: number; first: number; count: number }> = [];
  for (;;) {
    let track = -1;
    for (let index = 0; index < times.length; index += 1)
      if (
        next[index] < times[index].length &&
        (track < 0 || times[index][next[index]] < times[track][next[track]])
      )
        track = index;
    if (track < 0) return order;
    const first = next[track];
    const limit = times[track][first] + span;
    while (
      next[track] < times[track].length &&
      (next[track] === first || times[track][next[track]] < limit)
    )
      next[track] += 1;
    order.push({ track, first, count: next[track] - first });
  }
}

export function muxMp4(
  video: MuxVideoTrack,
  audio?: MuxAudioTrack,
  audioBitrate = 96_000,
): Uint8Array<ArrayBuffer> {
  if (!video.samples.length) throw new Error('videoFailed');
  const timing = videoTiming(
    video.samples.map((sample) => sample.pts),
    video.lastDuration,
  );
  // The movie timescale equals the video's, so video edits convert exactly.
  const movieTimescale = video.timescale;
  const toMovie = (value: number, timescale: number) =>
    Math.round((value * movieTimescale) / timescale);
  const videoMovieDuration = toMovie(timing.mediaDuration, video.timescale);
  const audioDuration = audio?.samples.reduce((total, sample) => total + sample.duration, 0) ?? 0;
  const audioMovieDuration = audio
    ? toMovie(
        Math.min(audio.length ?? Infinity, Math.max(0, audioDuration - (audio.priming ?? 0))),
        audio.sampleRate,
      )
    : 0;

  const audioSamples = audio?.samples.length ? audio.samples : [];
  let elapsed = 0;
  const decodeTimes = [
    timing.durations.map((duration) => {
      const start = elapsed;
      elapsed += duration;
      return start / video.timescale;
    }),
  ];
  if (audio && audioSamples.length) {
    let time = 0;
    decodeTimes.push(
      audioSamples.map((sample) => {
        const start = time;
        time += sample.duration / audio.sampleRate;
        return start;
      }),
    );
  }
  const order = interleave(decodeTimes);
  const tracksSamples = [video.samples, audioSamples];
  const chunkBytes = (entry: (typeof order)[number]) =>
    tracksSamples[entry.track]
      .slice(entry.first, entry.first + entry.count)
      .reduce((total, sample) => total + sample.data.length, 0);
  const chunksFor = (start: number) => {
    const result: Chunk[][] = [[], []];
    let offset = start;
    for (const entry of order) {
      result[entry.track].push({ count: entry.count, offset });
      offset += chunkBytes(entry);
    }
    return result;
  };

  const layout = (mdatData: number) => {
    const [videoChunks, audioChunks] = chunksFor(mdatData);
    const videoEdits: Array<{ duration: number; mediaTime: number }> = [];
    const shift = timing.delay - timing.start;
    if (shift < 0) videoEdits.push({ duration: toMovie(-shift, video.timescale), mediaTime: -1 });
    if (videoEdits.length || shift > 0)
      videoEdits.push({ duration: videoMovieDuration, mediaTime: Math.max(0, shift) });
    const extra = [
      fullBox(
        'stss',
        0,
        0,
        build((w) => {
          const sync = video.samples.flatMap((sample, index) => (sample.sync ? [index + 1] : []));
          w.u32(sync.length);
          for (const number of sync) w.u32(number);
        }),
      ),
    ];
    if (timing.composition.some((value) => value !== 0))
      extra.push(
        fullBox(
          'ctts',
          0,
          0,
          build((w) => {
            const entries = runs(timing.composition);
            w.u32(entries.length);
            for (const [count, offset] of entries) w.u32(count).u32(offset);
          }),
        ),
      );
    const videoTrak = box(
      'trak',
      tkhd(
        1,
        videoMovieDuration + (shift < 0 ? toMovie(-shift, video.timescale) : 0),
        false,
        video.width,
        video.height,
      ),
      ...(videoEdits.length ? [elst(videoEdits)] : []),
      box(
        'mdia',
        mdhd(video.timescale, timing.mediaDuration),
        hdlr('vide', 'VideoHandler'),
        box(
          'minf',
          fullBox('vmhd', 0, 1, new Uint8Array(8)),
          dinf(),
          stbl(
            avc1(video),
            timing.durations,
            video.samples.map((sample) => sample.data.length),
            videoChunks,
            extra,
          ),
        ),
      ),
    );
    const tracks = [videoTrak];
    if (audio?.samples.length)
      tracks.push(
        box(
          'trak',
          tkhd(2, audioMovieDuration, true),
          ...(audio.priming || audio.length !== undefined
            ? [elst([{ duration: audioMovieDuration, mediaTime: audio.priming ?? 0 }])]
            : []),
          box(
            'mdia',
            mdhd(audio.sampleRate, audioDuration),
            hdlr('soun', 'SoundHandler'),
            box(
              'minf',
              fullBox('smhd', 0, 0, new Uint8Array(4)),
              dinf(),
              stbl(
                mp4a(audio, audioBitrate),
                audio.samples.map((sample) => sample.duration),
                audio.samples.map((sample) => sample.data.length),
                audioChunks,
                [],
              ),
            ),
          ),
        ),
      );
    return box(
      'moov',
      mvhd(movieTimescale, Math.max(videoMovieDuration, audioMovieDuration), tracks.length + 1),
      ...tracks,
    );
  };

  const ftyp = box(
    'ftyp',
    build((w) => w.text('isom').u32(0x200).text('isomiso2avc1mp41')),
  );
  const dataBytes = order.reduce((total, entry) => total + chunkBytes(entry), 0);
  // Offsets depend on the moov size, which does not depend on the offset values.
  const mdatData = ftyp.length + layout(0).length + 8;
  if (mdatData + dataBytes > 0xffffffff) throw new Error('videoFailed');
  const writer = new Writer().bytes(ftyp).bytes(layout(mdatData));
  writer.u32(8 + dataBytes).text('mdat');
  for (const entry of order)
    for (const sample of tracksSamples[entry.track].slice(entry.first, entry.first + entry.count))
      writer.bytes(sample.data);
  return writer.finish();
}
