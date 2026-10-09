import { cx } from './cx';

export type GlyphStatus = 'pending' | 'processing' | 'done' | 'error' | 'cancelled';

const RADIUS = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A 12 px state mark that reads without colour: dashed ring waits, an arc fills with
 * progress, a filled check is done, a filled bar is an error, a struck ring is cancelled.
 */
export function StatusGlyph({ status, progress = 0 }: { status: GlyphStatus; progress?: number }) {
  const share = Math.max(0, Math.min(100, progress)) / 100;
  return (
    <svg
      className={cx(
        'pf-status-glyph',
        `is-${status}`,
        status === 'processing' && !share && 'is-busy',
      )}
      viewBox="0 0 12 12"
      aria-hidden
    >
      {status === 'pending' && <circle className="pf-glyph-ring" cx="6" cy="6" r={RADIUS} />}
      {status === 'processing' && (
        <>
          <circle className="pf-glyph-track" cx="6" cy="6" r={RADIUS} />
          <circle
            className="pf-glyph-arc"
            cx="6"
            cy="6"
            r={RADIUS}
            transform="rotate(-90 6 6)"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - (share || 0.25))}
          />
        </>
      )}
      {(status === 'done' || status === 'error') && (
        <circle className="pf-glyph-fill" cx="6" cy="6" r="6" />
      )}
      {status === 'done' && <path className="pf-glyph-mark" d="M3.4 6.2 5.2 8 8.7 4.3" />}
      {status === 'error' && <path className="pf-glyph-mark" d="M6 3.3v3.4M6 8.6v.1" />}
      {status === 'cancelled' && (
        <>
          <circle className="pf-glyph-track" cx="6" cy="6" r={RADIUS} />
          <path className="pf-glyph-mark" d="M3.6 6h4.8" />
        </>
      )}
    </svg>
  );
}
