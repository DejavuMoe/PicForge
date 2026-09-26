import { getRelativePath } from '../utils/fileUtils';

export interface MediaItem {
  id: string;
  name: string;
  image?: File;
  video?: File;
  issue?: string;
}
export interface MediaOutput {
  image?: Blob;
  video?: Blob;
  /** Which converter produced the video (diagnostics; the output contract is the same). */
  videoEngine?: 'webcodecs' | 'ffmpeg';
}
export type VideoPreset = 'balanced' | 'quality' | 'compact';
export interface MotionSettings {
  preset: VideoPreset;
  fps: 'source' | '30';
  quality: number;
  audio: boolean;
}
export const defaultMotionSettings: MotionSettings = {
  preset: 'balanced',
  fps: 'source',
  quality: 85,
  audio: true,
};

/**
 * Group Live Photo halves. Files pair by folder-relative basename; when Apple's
 * content identifier is known for both halves it is checked, and a lone still
 * and a lone video that share one identifier are paired even if renamed.
 * Unsupported files (for example .AAE edit sidecars) are listed on their own
 * and never block the pair they sit next to.
 */
export function groupMedia(
  files: File[],
  android: boolean,
  identifiers?: ReadonlyMap<File, string | undefined>,
): MediaItem[] {
  if (android)
    return files.map((image, i) => ({
      id: String(i),
      name: image.name.replace(/\.[^.]+$/, ''),
      image,
      issue: /\.jpe?g$/i.test(image.name) ? undefined : 'unsupported',
    }));
  const groups = new Map<string, MediaItem>();
  for (const file of files) {
    const path = getRelativePath(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    const key = path.replace(/\.[^.]+$/, '').toLowerCase();
    const slot = /\.(heic|heif|jpe?g)$/i.test(file.name)
      ? 'image'
      : /\.(mov|mp4)$/i.test(file.name)
        ? 'video'
        : null;
    if (!slot) {
      const id = `${path.toLowerCase()}\u0000unsupported`;
      if (!groups.has(id)) groups.set(id, { id, name: file.name, issue: 'unsupported' });
      continue;
    }
    const item = groups.get(key) ?? { id: key, name };
    if (item[slot]) item.issue = 'ambiguous';
    else item[slot] = file;
    groups.set(key, item);
  }
  const items = [...groups.values()];
  if (!identifiers) return items;

  const idOf = (file?: File) => (file ? identifiers.get(file) : undefined);
  for (const item of items) {
    const [image, video] = [idOf(item.image), idOf(item.video)];
    if (!item.issue && image && video && image !== video) item.issue = 'mismatch';
  }
  // Pair renamed halves only when exactly one lone still and one lone video share an identifier.
  const lone = (slot: 'image' | 'video') => {
    const byId = new Map<string, MediaItem[]>();
    for (const item of items) {
      const other = slot === 'image' ? item.video : item.image;
      const id = idOf(item[slot]);
      if (item.issue || other || !id) continue;
      byId.set(id, [...(byId.get(id) ?? []), item]);
    }
    return byId;
  };
  const [stills, videos] = [lone('image'), lone('video')];
  const merged = new Set<MediaItem>();
  for (const [id, [still, ...extraStills]] of stills) {
    const [video, ...extraVideos] = videos.get(id) ?? [];
    if (!video || extraStills.length || extraVideos.length) continue;
    still.video = video.video;
    merged.add(video);
  }
  return items.filter((item) => !merged.has(item));
}

// MotionFlow's binary split, with full top-level box validation before accepting ftyp.
// Some cameras append zero padding after the MP4. The box walk determines where the
// *structure* ends; the exported video always runs to EOF so that JPG + MP4 rebuild
// the original file byte-for-byte, padding included. A zero size+type pair marks the
// start of padding explicitly — otherwise a long zero tail would be swallowed as a
// size-0 "to EOF" box and bypass the padding limit.
const MAX_TRAILING_PADDING = 4096;
const MAX_BOX_CHECKS = 100_000;

export function splitMotionPhoto(buffer: ArrayBuffer, source?: Blob): MediaOutput {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('invalidMotion');
  const view = new DataView(buffer);
  // Bound total work across all candidate starts, not just each individual walk.
  let boxChecks = 0;
  for (let i = bytes.length - 16; i >= 4; i--) {
    if (bytes[i] !== 102 || bytes[i + 1] !== 116 || bytes[i + 2] !== 121 || bytes[i + 3] !== 112)
      continue;
    const start = i - 4;
    let pos = start;
    let movie = false;
    let media = false;
    while (pos + 8 <= bytes.length) {
      if (++boxChecks > MAX_BOX_CHECKS) throw new Error('invalidMotion');
      let size = view.getUint32(pos);
      const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
      if (size === 0 && type === '\0\0\0\0') break; // zero padding begins here
      let header = 8;
      if (size === 1) {
        if (pos + 16 > bytes.length) break;
        size = Number(view.getBigUint64(pos + 8));
        header = 16;
      } else if (size === 0) size = bytes.length - pos;
      if (!Number.isSafeInteger(size) || size < header || pos + size > bytes.length) break;
      if (pos === start && (type !== 'ftyp' || size < 16)) break;
      movie ||= type === 'moov';
      media ||= type === 'mdat';
      pos += size;
    }
    if (!movie || !media || pos <= start) continue;
    const tail = bytes.length - pos;
    if (tail > MAX_TRAILING_PADDING) continue;
    if (tail > 0 && bytes.subarray(pos).some((byte) => byte !== 0)) continue;
    return {
      image: source
        ? source.slice(0, start, 'image/jpeg')
        : new Blob([bytes.subarray(0, start)], { type: 'image/jpeg' }),
      video: source
        ? source.slice(start, source.size, 'video/mp4')
        : new Blob([bytes.subarray(start)], { type: 'video/mp4' }),
    };
  }
  throw new Error('invalidMotion');
}

/** AAC bitrate of both video paths. */
export const AUDIO_BITRATE = 96_000;

/** Longest output edge of a video preset. */
export const videoEdge = (settings: MotionSettings) =>
  settings.preset === 'compact' ? 1280 : 1920;

/** FFmpeg audio-only AAC helper for the WebCodecs path when AudioEncoder is unavailable. */
export function audioArguments(input = 'input.mov'): string[] {
  return [
    '-i',
    input,
    '-map',
    '0:a:0',
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    `${AUDIO_BITRATE / 1000}k`,
    '-map_metadata',
    '-1',
    'audio.m4a',
  ];
}

export function videoArguments(
  settings: MotionSettings,
  aperture?: string[],
  input = 'input.mov',
): string[] {
  const edge = videoEdge(settings);
  const crf = { balanced: 23, quality: 20, compact: 26 }[settings.preset];
  const scale = `scale=w='min(iw,${edge})':h='min(ih,${edge})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  return [
    '-i',
    input,
    '-map',
    '0:v:0',
    ...(settings.audio ? ['-map', '0:a:0?'] : ['-an']),
    '-vf',
    [...(aperture ?? []), scale, ...(settings.fps === '30' ? ['fps=30'] : [])].join(','),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-fps_mode',
    settings.fps === '30' ? 'cfr' : 'passthrough',
    '-enc_time_base',
    '1:600',
    '-c:a',
    'aac',
    '-b:a',
    `${AUDIO_BITRATE / 1000}k`,
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    'output.mp4',
  ];
}
