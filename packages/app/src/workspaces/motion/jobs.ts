import type { MediaItem, MediaOutput } from '../../motion/media';
import type { GlyphStatus } from '../../components/ui/StatusGlyph';

export interface Job {
  status: 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
  output?: MediaOutput;
}

/** Grouping issues and job errors share one key space; cancellation is not a failure. */
export function itemError(item: MediaItem, job?: Job): string | undefined {
  return item.issue || job?.error;
}

export function itemGlyph(item: MediaItem, job?: Job): GlyphStatus {
  const error = itemError(item, job);
  if (error === 'cancelled') return 'cancelled';
  if (error) return 'error';
  return job?.status === 'processing' ? 'processing' : job?.status === 'done' ? 'done' : 'pending';
}

/** Label key for an item's state, shared by the queue row and the stage. */
export function itemStatusKey(item: MediaItem, job?: Job): string {
  const error = itemError(item, job);
  if (error) return error === 'cancelled' ? 'status.cancelled' : 'motion.error';
  return `motion.${job?.status ?? 'queued'}`;
}

/** A still to show for an item before (or instead of) its converted output. */
export function thumbSource(item: MediaItem, job?: Job): Blob | undefined {
  return (
    job?.output?.image ?? (item.image && /\.jpe?g$/i.test(item.image.name) ? item.image : undefined)
  );
}
