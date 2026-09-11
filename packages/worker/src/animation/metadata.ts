/** Container inspection only: never decode or retain a full RGBA frame here. */
export interface AnimationMetadata {
  format: 'gif' | 'apng' | 'webp';
  width: number;
  height: number;
  /** Cumulative frame ends in milliseconds, quantized once from source time. */
  ends: number[];
  /** Total plays; 0 means forever (GIF's repeat count is converted here). */
  plays: number;
  /** PNG default image is separate from the animation. */
  poster?: boolean;
  /** Promote PNG patches before composition when the decoder needs an alpha plane. */
  normalizeRgba?: boolean;
}

export function animationError(code: string): never {
  throw new Error(`Animation: ${code}`);
}

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FRAMES = 2000;
const MAX_DURATION = 600_000;
const cache = new WeakMap<Blob, Promise<AnimationMetadata | null>>();

export function inspectAnimation(source: Blob): Promise<AnimationMetadata | null> {
  let result = cache.get(source);
  if (!result) {
    result = (async () => {
      const head = new Uint8Array(await source.slice(0, 12).arrayBuffer());
      const format = formatOf(head);
      if (!format) return null;
      // PNG requires acTL before IDAT. Skip static pixel data without reading it.
      if (format === 'apng') {
        let chunks = 0;
        for (let p = 8; p < source.size;) {
          if (++chunks > 1024) animationError('limit');
          const chunk = new Uint8Array(await source.slice(p, p + 8).arrayBuffer());
          if (chunk.length !== 8) animationError('invalid');
          const n = new DataView(chunk.buffer).getUint32(0);
          if (p + n + 12 > source.size) animationError('invalid');
          const name = tag(chunk, 4);
          if (name === 'acTL') break;
          if (name === 'fcTL' || name === 'fdAT') animationError('invalid');
          if (name === 'IDAT' || name === 'IEND') return null;
          p += n + 12;
        }
      }
      if (format === 'webp') {
        const extended = new Uint8Array(await source.slice(12, 30).arrayBuffer());
        if (tag(extended, 0) === 'VP8 ' || tag(extended, 0) === 'VP8L') return null;
        if (tag(extended, 0) === 'VP8X' && extended.length === 18 && !(extended[8] & 2))
          return null;
      }
      if (source.size > MAX_BYTES) animationError('limit');
      return parseAnimation(new Uint8Array(await source.arrayBuffer()));
    })();
    cache.set(source, result);
  }
  return result;
}

function tag(bytes: Uint8Array, at: number, length = 4) {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}
function formatOf(b: Uint8Array): AnimationMetadata['format'] | null {
  if (['GIF87a', 'GIF89a'].includes(tag(b, 0, 6))) return 'gif';
  if (tag(b, 0, 8) === '\x89PNG\r\n\x1a\n') return 'apng';
  if (tag(b, 0) === 'RIFF' && tag(b, 8) === 'WEBP') return 'webp';
  return null;
}

export function parseAnimation(bytes: Uint8Array): AnimationMetadata | null {
  const format = formatOf(bytes);
  if (!format) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (at: number, n: number) => {
    if (at < 0 || n < 0 || at + n > bytes.length) animationError('invalid');
  };
  const u16 = (at: number, le = false) => {
    need(at, 2);
    return view.getUint16(at, le);
  };
  const u32 = (at: number, le = false) => {
    need(at, 4);
    return view.getUint32(at, le);
  };
  const u24 = (at: number) => {
    need(at, 3);
    return bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
  };
  let width = 0,
    height = 0,
    plays = 1,
    elapsed = 0;
  const ends: number[] = [];
  const frame = (duration: number) => {
    // Zero-delay frames have no portable playback meaning. Use an explicit 100 ms.
    elapsed += duration || 100;
    const end = Math.round(elapsed);
    if (end <= (ends[ends.length - 1] ?? 0)) animationError('timing');
    ends.push(end);
    if (ends.length > MAX_FRAMES || elapsed > MAX_DURATION) animationError('limit');
  };
  const rect = (x: number, y: number, w: number, h: number) => {
    if (!w || !h || x + w > width || y + h > height) animationError('invalid');
  };
  let animated = false;
  let poster = false;
  let normalizeRgba = false;
  let unsupportedColor = false;
  if (format === 'gif') {
    need(0, 13);
    width = u16(6, true);
    height = u16(8, true);
    let p = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
    let delay = 100;
    const blocks = () => {
      while (true) {
        need(p, 1);
        const size = bytes[p++];
        if (!size) return;
        need(p, size);
        p += size;
      }
    };
    while (true) {
      need(p, 1);
      const kind = bytes[p++];
      if (kind === 0x3b) break;
      if (kind === 0x21) {
        need(p, 1);
        const label = bytes[p++];
        if (label === 0xf9) {
          need(p, 6);
          if (bytes[p] !== 4 || bytes[p + 5] !== 0 || ((bytes[p + 1] >> 2) & 7) > 3)
            animationError('invalid');
          // The GIF user-input flag cannot be represented in a timed WebP.
          if (bytes[p + 1] & 2) animationError('timing');
          delay = u16(p + 2, true) * 10 || 100;
          p += 6;
        } else {
          if (label === 0x01) animationError('unsupported'); // Plain-text rendering is not qualified.
          if (label === 0xff) {
            need(p, 12);
            const app = tag(bytes, p + 1, bytes[p]);
            if (app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0') {
              need(p, 17);
              if (bytes[p] !== 11 || bytes[p + 12] !== 3 || bytes[p + 13] !== 1)
                animationError('invalid');
              const repeats = u16(p + 14, true);
              plays = repeats === 0 ? 0 : repeats + 1;
            }
            if (app === 'ICCRGBG1012') unsupportedColor = true;
          }
          blocks();
        }
      } else if (kind === 0x2c) {
        need(p, 9);
        rect(u16(p, true), u16(p + 2, true), u16(p + 4, true), u16(p + 6, true));
        const flags = bytes[p + 8];
        p += 9 + (flags & 128 ? 3 * (1 << ((flags & 7) + 1)) : 0);
        need(p, 1);
        if (bytes[p] < 2 || bytes[p] > 8) animationError('invalid');
        p++;
        blocks();
        frame(delay);
        delay = 100;
      } else animationError('invalid');
    }
    if (!ends.length) animationError('invalid');
    animated = ends.length > 1;
  } else if (format === 'apng') {
    need(8, 25);
    if (tag(bytes, 12) !== 'IHDR' || u32(8) !== 13) animationError('invalid');
    width = u32(16);
    height = u32(20);
    unsupportedColor = bytes[24] === 16;
    normalizeRgba = ![2, 6].includes(bytes[25]);
    let declared = 0,
      sequence = 0,
      sawData = false,
      frameData = false,
      ended = false;
    for (let p = 8; p < bytes.length;) {
      need(p, 12);
      const n = u32(p),
        name = tag(bytes, p + 4),
        at = p + 8;
      need(p, n + 12);
      if (name === 'acTL') {
        if (animated || sawData || n !== 8) animationError('invalid');
        animated = true;
        declared = u32(at);
        plays = u32(at + 4);
        if (!declared || declared > MAX_FRAMES) animationError('limit');
      } else if (name === 'fcTL') {
        if (!ends.length && sawData) poster = true;
        if (
          bytes[25] !== 6 &&
          (bytes[at + 24] === 1 ||
            (!ends.length && sawData && (u32(at + 4) !== width || u32(at + 8) !== height)))
        )
          normalizeRgba = true;
        if (!animated || n !== 26 || u32(at) !== sequence++ || (ends.length && !frameData))
          animationError('invalid');
        rect(u32(at + 12), u32(at + 16), u32(at + 4), u32(at + 8));
        if (bytes[at + 24] > 2 || bytes[at + 25] > 1) animationError('invalid');
        frame((u16(at + 20) * 1000) / (u16(at + 22) || 100));
        frameData = false;
      } else if (name === 'IDAT') {
        sawData = true;
        if (ends.length) frameData = true;
      } else if (name === 'fdAT') {
        if (!animated || !ends.length || n < 4 || u32(at) !== sequence++) animationError('invalid');
        frameData = true;
      } else if (name === 'iCCP' || name === 'cICP') {
        unsupportedColor = true;
      } else if (name === 'cHRM') {
        const srgb = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
        if (n !== 32 || srgb.some((value, i) => u32(at + i * 4) !== value)) unsupportedColor = true;
      } else if (name === 'gAMA') {
        if (n !== 4 || u32(at) !== 45455) unsupportedColor = true;
      } else if (name === 'IEND') {
        if (n !== 0) animationError('invalid');
        ended = true;
        break;
      }
      p += n + 12;
    }
    if (!ended || (animated && (ends.length !== declared || !frameData))) animationError('invalid');
  } else {
    if (u32(4, true) + 8 !== bytes.length) animationError('invalid');
    for (let p = 12; p < bytes.length;) {
      need(p, 8);
      const n = u32(p + 4, true),
        name = tag(bytes, p),
        at = p + 8;
      need(at, n + (n & 1));
      if (name === 'VP8X') {
        if (n !== 10) animationError('invalid');
        animated = !!(bytes[at] & 2);
        width = u24(at + 4) + 1;
        height = u24(at + 7) + 1;
      } else if (name === 'ANIM') {
        if (n !== 6) animationError('invalid');
        animated = true;
        plays = u16(at + 4, true);
      } else if (name === 'ANMF') {
        if (n < 16) animationError('invalid');
        animated = true;
        frame(u24(at + 12));
      }
      p += 8 + n + (n & 1);
    }
  }
  if (!animated) return null;
  if (
    !width ||
    !height ||
    width > 16383 ||
    height > 16383 ||
    width * height > 8_000_000 ||
    width * height * ends.length > 500_000_000 ||
    plays > 65535
  )
    animationError('limit');
  if (unsupportedColor) animationError('color');
  return {
    format,
    width,
    height,
    ends,
    plays,
    ...(poster ? { poster: true } : {}),
    ...(normalizeRgba ? { normalizeRgba: true } : {}),
  };
}

/** FFmpeg 5.1's libwebp_anim estimates the final duration. Preserve source time.
 * Earlier output frame boundaries must match the source (coalesced frames allowed).
 */
export function finishWebpTimeline(
  bytes: Uint8Array,
  source: AnimationMetadata,
  width = source.width,
  height = source.height,
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 12 ||
    tag(bytes, 0) !== 'RIFF' ||
    tag(bytes, 8) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    animationError('output');
  let elapsed = 0,
    last = -1,
    previousDuration = 0;
  let boundary = 0;
  for (let p = 12; p + 8 <= bytes.length;) {
    const n = view.getUint32(p + 4, true);
    if (p + 8 + n + (n & 1) > bytes.length) animationError('output');
    if (tag(bytes, p) === 'ANIM') {
      if (n !== 6) animationError('output');
      bytes.fill(0, p + 8, p + 12); // Explicit transparent canvas, not the core's white default.
    }
    if (tag(bytes, p) === 'ANMF') {
      if (n < 16) animationError('output');
      if (last !== -1) {
        elapsed += previousDuration;
        while (boundary < source.ends.length && source.ends[boundary] < elapsed - 1) boundary++;
        if (boundary >= source.ends.length - 1 || Math.abs(source.ends[boundary] - elapsed) > 1)
          animationError('timing');
      }
      last = p + 20;
      previousDuration = bytes[last] + bytes[last + 1] * 256 + bytes[last + 2] * 65536;
    }
    p += 8 + n + (n & 1);
  }
  // libwebp collapses visually identical frames to a still. Restore a one-frame
  // animation container, preserving duration/plays without decoding pixels again.
  if (last < 0) {
    const chunks: Uint8Array[] = [];
    let alpha = false;
    for (let p = 12; p + 8 <= bytes.length;) {
      const n = view.getUint32(p + 4, true),
        name = tag(bytes, p);
      if (name === 'VP8X') alpha ||= !!(bytes[p + 8] & 16);
      if (name === 'VP8L') alpha ||= !!(bytes[p + 12] & 16);
      if (['VP8 ', 'VP8L', 'ALPH'].includes(name))
        chunks.push(bytes.subarray(p, p + 8 + n + (n & 1)));
      p += 8 + n + (n & 1);
    }
    if (!chunks.length) animationError('output');
    const payloadSize = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(68 + payloadSize),
      v = new DataView(out.buffer);
    const text = (at: number, value: string) => {
      for (let i = 0; i < value.length; i++) out[at + i] = value.charCodeAt(i);
    };
    const int24 = (at: number, value: number) => {
      out[at] = value & 255;
      out[at + 1] = (value >> 8) & 255;
      out[at + 2] = value >> 16;
    };
    text(0, 'RIFF');
    v.setUint32(4, out.length - 8, true);
    text(8, 'WEBP');
    text(12, 'VP8X');
    v.setUint32(16, 10, true);
    out[20] = 2 | (alpha ? 16 : 0);
    int24(24, width - 1);
    int24(27, height - 1);
    text(30, 'ANIM');
    v.setUint32(34, 6, true);
    v.setUint16(42, source.plays, true);
    text(44, 'ANMF');
    v.setUint32(48, 16 + payloadSize, true);
    int24(58, width - 1);
    int24(61, height - 1);
    int24(64, source.ends[source.ends.length - 1]);
    out[67] = 2;
    let at = 68;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
  const duration = source.ends[source.ends.length - 1] - elapsed;
  if (duration < 1 || duration > 0xffffff) animationError('timing');
  bytes[last] = duration & 255;
  bytes[last + 1] = (duration >> 8) & 255;
  bytes[last + 2] = duration >> 16;
  return bytes;
}
