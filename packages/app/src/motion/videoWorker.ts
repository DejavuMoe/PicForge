/**
 * WebCodecs Live Photo video conversion in a dedicated Worker: read the MOV sample
 * tables, decode the main video track, rotate/crop/fit in YUV, encode H.264 and
 * write an MP4 with AAC audio. A capability gap is reported as `unsupported` before
 * any work; a failure as `error`. The caller then converts the original File with
 * FFmpeg, so both replies mean "use the existing path", never a lost result.
 */

import { readMovieBox } from './cleanAperture';
import { AUDIO_BITRATE, videoEdge, type MotionSettings } from './media';
import {
  aacFormat,
  parseMovie,
  videoTrackInfo,
  UNSUPPORTED_MOVIE,
  type MovieTrack,
  type SampleTable,
} from './movDemux';
import { muxMp4, type MuxAudioTrack, type MuxSample } from './mp4Mux';
import { avcCodecs, colourCodes, colourSpaceInit, planFrames, transformFrame } from './videoFrames';

export type VideoWorkerRequest =
  { type: 'start'; video: File; settings: MotionSettings } | { type: 'audio'; m4a: ArrayBuffer };

export type AudioMode = 'none' | 'copy' | 'ffmpeg';

export type VideoWorkerResponse =
  | { type: 'needAudio' }
  | { type: 'progress'; value: number }
  | { type: 'done'; mp4: Blob; codec: string; audio: AudioMode }
  | { type: 'unsupported'; reason: string }
  | { type: 'error'; message: string };

/** Encoder bits per pixel per frame. Hardware H.264 needs more than x264 at CRF 20–26. */
const BITS_PER_PIXEL: Record<MotionSettings['preset'], number> = {
  quality: 0.1,
  balanced: 0.07,
  compact: 0.05,
};
const MAX_READ_BYTES = 16 * 1024 * 1024;
/** Frames and chunks in flight; hardware decoders stall when outputs are not closed. */
const QUEUE_LIMIT = 4;

class Unsupported extends Error {}
const unsupported = (reason: string): never => {
  throw new Unsupported(reason);
};

const post = (message: VideoWorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

let audioReply: ((m4a: ArrayBuffer) => void) | undefined;

self.onmessage = async ({ data }: MessageEvent<VideoWorkerRequest>) => {
  if (data.type === 'audio') {
    audioReply?.(data.m4a);
    return;
  }
  try {
    const result = await convert(data.video, data.settings);
    post({ type: 'done', ...result });
  } catch (error) {
    if (error instanceof Unsupported) post({ type: 'unsupported', reason: error.message });
    else if (error instanceof Error && error.message === UNSUPPORTED_MOVIE)
      post({ type: 'unsupported', reason: UNSUPPORTED_MOVIE });
    else post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

/** Read sample payloads, merging byte-adjacent samples into bounded reads. */
async function readSamples(file: Blob, table: SampleTable): Promise<Uint8Array[]> {
  const samples: Uint8Array[] = new Array(table.count);
  for (let start = 0; start < table.count;) {
    let end = start + 1;
    let bytes = table.sizes[start];
    while (
      end < table.count &&
      table.offsets[end] === table.offsets[end - 1] + table.sizes[end - 1] &&
      bytes + table.sizes[end] <= MAX_READ_BYTES
    )
      bytes += table.sizes[end++];
    const offset = table.offsets[start];
    const buffer = new Uint8Array(await file.slice(offset, offset + bytes).arrayBuffer());
    if (buffer.length !== bytes) throw new Error('videoFailed');
    for (let index = start, at = 0; index < end; at += table.sizes[index++])
      samples[index] = buffer.subarray(at, at + table.sizes[index]);
    start = end;
  }
  return samples;
}

const copyDescription = (config: AllowSharedBufferSource) =>
  new Uint8Array(
    ArrayBuffer.isView(config)
      ? config.buffer.slice(config.byteOffset, config.byteOffset + config.byteLength)
      : config.slice(0),
  );

/** Copy AAC access units, keeping the source (or FFmpeg helper's) priming edit. */
async function copyAac(source: Blob, track: MovieTrack): Promise<MuxAudioTrack> {
  const format = aacFormat(track);
  if (!format) throw new Error('audioFailed');
  const table = track.samples();
  const data = await readSamples(source, table);
  const toRate = (value: number) => Math.round((value * format.sampleRate) / track.timescale);
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    description: format.description,
    samples: data.map((bytes, index) => ({
      data: bytes,
      duration: toRate(table.durations[index]),
    })),
    priming: table.edit < 0 ? toRate(-table.edit) : undefined,
    length: table.end !== undefined ? toRate(table.end) : undefined,
  };
}

async function convert(file: File, settings: MotionSettings) {
  if (
    typeof VideoDecoder !== 'function' ||
    typeof VideoEncoder !== 'function' ||
    typeof VideoFrame !== 'function' ||
    typeof EncodedVideoChunk !== 'function'
  )
    unsupported('webcodecs');
  if (settings.fps !== 'source') unsupported('fps');
  const moov = await readMovieBox(file);
  if (!moov) unsupported('noMovie');
  const movie = parseMovie(moov!);
  // FFmpeg maps the first video stream; auxiliary video comes after the main track.
  const track = movie.tracks.find((entry) => entry.handler === 'vide' || entry.handler === 'auxv');
  if (!track || track.handler !== 'vide') return unsupported('noVideo');
  const info = videoTrackInfo(track);
  if (info.bitDepth !== 8) unsupported('bitDepth');
  if (info.colour && [16, 18].includes(info.colour.transfer)) unsupported('hdr');
  const table = track.samples();
  if (!table.count || table.pts.some((value) => value < 0)) unsupported('timing');
  const micros = (value: number) => Math.round((value * 1e6) / track.timescale);
  const ptsByMicros = new Map<number, number>();
  table.pts.forEach((value) => ptsByMicros.set(micros(value), value));
  if (ptsByMicros.size !== table.count) unsupported('timing');

  const decoderConfig: VideoDecoderConfig = {
    codec: info.codec,
    description: info.description,
    codedWidth: track.width,
    codedHeight: track.height,
    hardwareAcceleration: 'no-preference',
  };
  const decoderSupport = await VideoDecoder.isConfigSupported(decoderConfig).catch(() => undefined);
  if (!decoderSupport?.supported) unsupported(`decoder ${info.codec}`);

  const plan = planFrames(info, track.width, track.height, videoEdge(settings));
  const sorted = Array.from(table.pts).sort((a, b) => a - b);
  // The last frame lasts until the stream (or edit list) ends, so the output keeps
  // the source duration.
  const end = Math.min(
    table.durations.reduce((total, value) => total + value, 0) + table.edit,
    table.end ?? Infinity,
  );
  const finalInterval = sorted.length > 1 ? sorted.at(-1)! - sorted.at(-2)! : track.timescale / 30;
  const lastDuration = end > sorted.at(-1)! ? Math.round(end - sorted.at(-1)!) : finalInterval;
  const seconds = (sorted.at(-1)! - sorted[0] + lastDuration) / track.timescale;
  const framerate = Math.min(120, Math.max(1, table.count / seconds));
  const bitrate = Math.round(
    plan.width * plan.height * framerate * BITS_PER_PIXEL[settings.preset],
  );
  let encoderConfig: VideoEncoderConfig | undefined;
  for (const codec of avcCodecs(plan.width, plan.height)) {
    const config: VideoEncoderConfig = {
      codec,
      width: plan.width,
      height: plan.height,
      bitrate,
      framerate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      hardwareAcceleration: 'no-preference',
      avc: { format: 'avc' },
    };
    const support = await VideoEncoder.isConfigSupported(config).catch(() => undefined);
    if (support?.supported) {
      encoderConfig = config;
      break;
    }
  }
  if (!encoderConfig) return unsupported('encoder');

  // AAC is copied. Anything else (iPhone PCM) is encoded by the FFmpeg path's own AAC
  // encoder while the video converts, so bitrate and priming match that path exactly.
  // WebCodecs AudioEncoder is not used: in Playwright WebKit it left later <video>
  // loads stuck, reported wrong chunk durations and no encoder delay.
  const audioTrack = settings.audio
    ? movie.tracks.find((entry) => entry.handler === 'soun')
    : undefined;
  let audioMode: AudioMode = 'none';
  let pendingAudio: Promise<MuxAudioTrack | undefined> = Promise.resolve(undefined);
  if (audioTrack && aacFormat(audioTrack)) {
    audioMode = 'copy';
    pendingAudio = copyAac(file, audioTrack);
  } else if (audioTrack) {
    audioMode = 'ffmpeg';
    pendingAudio = new Promise<ArrayBuffer>((resolve) => {
      audioReply = resolve;
      post({ type: 'needAudio' });
    }).then((m4a) => {
      const helper = parseMovie(m4a).tracks.find((entry) => entry.handler === 'soun');
      if (!helper) throw new Error('audioFailed');
      return copyAac(new Blob([m4a]), helper);
    });
  }
  // Awaited after the video; keep an early failure from surfacing as unhandled.
  pendingAudio.catch(() => undefined);

  const data = await readSamples(file, table);
  let failure: unknown;
  const frames: VideoFrame[] = [];
  const chunks: MuxSample[] = [];
  let avcC: Uint8Array | undefined;
  const decoder = new VideoDecoder({
    output: (frame) => frames.push(frame),
    error: (error) => (failure ??= error),
  });
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const config = metadata?.decoderConfig?.description;
      if (config && !avcC) avcC = copyDescription(config);
      const pts = ptsByMicros.get(chunk.timestamp);
      if (pts === undefined) failure ??= new Error('timestamp');
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      chunks.push({ data: bytes, pts: pts ?? 0, sync: chunk.type === 'key' });
    },
    error: (error) => (failure ??= error),
  });
  let output: Uint8Array | undefined;
  let codes: ReturnType<typeof colourCodes>;
  let tagFrames = true;
  try {
    decoder.configure(decoderConfig);
    encoder.configure(encoderConfig);
    let fed = 0;
    let processed = 0;
    let flushed = false;
    let lastKey = -Infinity;
    let flushing: Promise<void> | undefined;
    while (processed < table.count) {
      if (failure) throw failure;
      const frame = frames.shift();
      if (frame) {
        try {
          if (frame.format !== 'I420' && frame.format !== 'NV12') throw new Error('frameFormat');
          if (
            frame.visibleRect?.width !== track.width ||
            frame.visibleRect?.height !== track.height
          )
            throw new Error('frameSize');
          const pts = ptsByMicros.get(frame.timestamp);
          if (pts === undefined) throw new Error('timestamp');
          const bytes = new Uint8Array(frame.allocationSize());
          const layout = await frame.copyTo(bytes);
          codes ??= colourCodes(info.colour, frame.colorSpace?.toJSON());
          output = transformFrame(
            plan,
            {
              format: frame.format,
              data: bytes,
              layout,
              fullRange: frame.colorSpace?.fullRange ?? info.colour?.fullRange ?? false,
            },
            output,
          );
          const init: VideoFrameBufferInit = {
            format: 'I420',
            codedWidth: plan.width,
            codedHeight: plan.height,
            timestamp: frame.timestamp,
            ...(frame.duration ? { duration: frame.duration } : {}),
          };
          let encoded: VideoFrame | undefined;
          // Tagged frames let the encoder write matching VUI; the MP4 colr box is
          // written either way. A runtime without a newer colour name rejects it.
          if (codes && tagFrames)
            try {
              encoded = new VideoFrame(output, { ...init, colorSpace: colourSpaceInit(codes) });
            } catch (error) {
              if (!(error instanceof TypeError)) throw error;
              tagFrames = false;
            }
          encoded ??= new VideoFrame(output, init);
          const keyFrame = pts - lastKey >= track.timescale;
          if (keyFrame) lastKey = pts;
          encoder.encode(encoded, { keyFrame });
          encoded.close();
        } finally {
          frame.close();
        }
        processed += 1;
        post({ type: 'progress', value: processed / table.count });
        while (encoder.encodeQueueSize > QUEUE_LIMIT && !failure) await tick();
        continue;
      }
      if (fed < table.count) {
        if (decoder.decodeQueueSize < QUEUE_LIMIT) {
          decoder.decode(
            new EncodedVideoChunk({
              type: table.sync[fed] ? 'key' : 'delta',
              timestamp: micros(table.pts[fed]),
              duration: micros(table.durations[fed]),
              data: data[fed],
            }),
          );
          fed += 1;
          continue;
        }
      } else if (!flushing) {
        flushing = decoder.flush().then(
          () => void (flushed = true),
          (error) => void (failure ??= error),
        );
        continue;
      } else if (flushed && !frames.length) throw new Error('frameCount');
      await tick();
    }
    await flushing;
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    for (const frame of frames) frame.close();
    if (decoder.state !== 'closed') decoder.close();
    if (encoder.state !== 'closed') encoder.close();
  }
  if (chunks.length !== table.count || !avcC) throw new Error('frameCount');
  const audio = await pendingAudio;
  const mp4 = muxMp4(
    {
      width: plan.width,
      height: plan.height,
      timescale: track.timescale,
      description: avcC,
      colour: codes ? { ...codes, fullRange: false } : undefined,
      samples: chunks,
      lastDuration,
    },
    audio,
    AUDIO_BITRATE,
  );
  // A Blob is passed to the page by reference, without another copy of the bytes.
  return {
    mp4: new Blob([mp4], { type: 'video/mp4' }),
    codec: encoderConfig.codec,
    audio: audioMode,
  };
}
