/**
 * One page-wide memory budget for heavy media work: compression tasks, animated
 * WebP conversion and Live Photo HEIC/video jobs all reserve their estimated
 * peak bytes here before they start.
 *
 * The estimates are deliberately conservative heuristics, not measurements:
 * they count the decoded source, target RGBA, the encoder's WASM copy and
 * working memory, and fixed engine heaps. They bound how much large work runs
 * together; they are not a promise about actual RSS, which also depends on the
 * browser and on WASM heaps that never shrink until their Worker exits.
 *
 * Deadlock rule: reserve budget before entering the FFmpeg lane, never while
 * holding it. The lane holder therefore never waits on the budget.
 */

import type { OutputFormat } from '@pic-forge/codecs';
import { downscaleScratchPixels } from '@pic-forge/worker';

const MB = 1024 * 1024;
const BYTES_PER_PIXEL = 4;

interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

interface Waiter {
  cost: number;
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class ResourceBudget {
  private used = 0;
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(readonly capacity: number) {}

  get usedBytes(): number {
    return this.used;
  }

  get pendingCount(): number {
    return this.waiters.length;
  }

  /**
   * Resolve with a release function once `cost` bytes fit. Requests are served in
   * order; a request larger than the whole budget runs alone rather than never.
   */
  acquire(cost: number, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const bytes = Math.max(0, Number.isFinite(cost) ? cost : this.capacity);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { cost: bytes, resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index === -1) return;
          this.waiters.splice(index, 1);
          reject(abortReason(signal));
          this.pump();
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
      this.pump();
    });
  }

  private pump(): void {
    while (this.waiters.length > 0) {
      const next = this.waiters[0];
      if (this.active > 0 && this.used + next.cost > this.capacity) return;
      this.waiters.shift();
      if (next.onAbort) next.signal?.removeEventListener('abort', next.onAbort);
      this.used += next.cost;
      this.active += 1;
      let released = false;
      next.resolve(() => {
        if (released) return;
        released = true;
        this.used -= next.cost;
        this.active -= 1;
        this.pump();
      });
    }
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Cancelled', 'AbortError');
}

export function getBudgetCapacity(device: DeviceHints = getNavigatorHints()): number {
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) return 384 * MB;
  return 1024 * MB;
}

/** Encoder working-memory multiplier on the target RGBA, including its WASM copy. */
const ENCODER_FACTOR: Record<OutputFormat, number> = {
  mozjpeg: 3,
  webp: 3,
  oxipng: 5,
  avif: 6,
};

/**
 * Browser-decoded source bitmap, the halving scratch canvases of a large
 * downscale (sized from the whole source, so crops are overestimated), target
 * RGBA and encoder memory.
 */
export function estimateCompressionCost(
  source: { width: number; height: number },
  target: { width: number; height: number },
  format: OutputFormat,
): number {
  const sourceBytes = source.width * source.height * BYTES_PER_PIXEL;
  const scratchBytes =
    downscaleScratchPixels(source.width, source.height, target.width, target.height) *
    BYTES_PER_PIXEL;
  const targetBytes = target.width * target.height * BYTES_PER_PIXEL;
  return sourceBytes + scratchBytes + targetBytes * (1 + (ENCODER_FACTOR[format] ?? 6));
}

/** FFmpeg core heap and code, independent of the input. */
export const FFMPEG_ENGINE_BYTES = 256 * MB;

/** Animated WebP conversion: engine, compressed input in MEMFS, a few composited frames. */
export function estimateAnimationCost(
  sourceBytes: number,
  target: { width: number; height: number },
): number {
  return FFMPEG_ENGINE_BYTES + sourceBytes * 2 + target.width * target.height * BYTES_PER_PIXEL * 4;
}

/** Live Photo video: engine plus decoded/encoded frame buffers; the input is read via WORKERFS. */
export function estimateVideoCost(sourceBytes: number): number {
  return FFMPEG_ENGINE_BYTES + 128 * MB + sourceBytes;
}

/**
 * HEIC decode (compressed input, decoded planes and RGBA inside libheif, plus the
 * transferred RGBA) and the following JPEG encode (RGBA plus MozJPEG's copy and
 * coefficients). The two stages run in separate Workers, so the larger one counts.
 */
export function estimateHeicCost(sourceBytes: number, pixels: number): number {
  const rgba = pixels * BYTES_PER_PIXEL;
  const decode = sourceBytes * 2 + rgba * 3;
  const encode = rgba * 3;
  return Math.max(decode, encode);
}

let shared: ResourceBudget | null = null;

/** The page-wide budget shared by every tool. */
export function getProcessingBudget(): ResourceBudget {
  if (!shared) shared = new ResourceBudget(getBudgetCapacity());
  return shared;
}

export function setProcessingBudgetForTests(next: ResourceBudget | null): void {
  shared = next;
}

function getNavigatorHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  return { deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency };
}
