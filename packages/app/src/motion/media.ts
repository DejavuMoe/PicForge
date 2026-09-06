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

export function groupMedia(files: File[], android: boolean): MediaItem[] {
  if (android)
    return files.map((image, i) => ({
      id: String(i),
      name: image.name.replace(/\.[^.]+$/, ''),
      image,
      issue: /\.jpe?g$/i.test(image.name) ? undefined : 'unsupported',
    }));
  const groups = new Map<string, MediaItem>();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const name = file.name.replace(/\.[^.]+$/, '');
    const key = path.replace(/\.[^.]+$/, '').toLowerCase();
    const item = groups.get(key) ?? { id: key, name };
    const slot = /\.(heic|heif|jpe?g)$/i.test(file.name)
      ? 'image'
      : /\.(mov|mp4)$/i.test(file.name)
        ? 'video'
        : null;
    if (!slot) item.issue = 'unsupported';
    else if (item[slot]) item.issue = 'ambiguous';
    else item[slot] = file;
    groups.set(key, item);
  }
  return [...groups.values()];
}

// MotionFlow's binary split, with full top-level box validation before accepting ftyp.
export function splitMotionPhoto(buffer: ArrayBuffer): MediaOutput {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('invalidMotion');
  const view = new DataView(buffer);
  for (let i = bytes.length - 16; i >= 4; i--) {
    if (bytes[i] !== 102 || bytes[i + 1] !== 116 || bytes[i + 2] !== 121 || bytes[i + 3] !== 112)
      continue;
    const start = i - 4;
    let pos = start;
    let movie = false;
    let media = false;
    while (pos + 8 <= bytes.length) {
      let size = view.getUint32(pos);
      const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
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
    if (pos === bytes.length && movie && media) {
      return {
        image: new Blob([bytes.subarray(0, start)], { type: 'image/jpeg' }),
        video: new Blob([bytes.subarray(start)], { type: 'video/mp4' }),
      };
    }
  }
  throw new Error('invalidMotion');
}

export function videoArguments(settings: MotionSettings, aperture?: string[]): string[] {
  const edge = settings.preset === 'compact' ? 1280 : 1920;
  const crf = { balanced: 23, quality: 20, compact: 26 }[settings.preset];
  const scale = `scale=w='min(iw,${edge})':h='min(ih,${edge})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  return [
    '-i',
    'input.mov',
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
    '96k',
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    'output.mp4',
  ];
}
