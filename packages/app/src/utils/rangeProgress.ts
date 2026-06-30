import type { CSSProperties } from 'react';

export type RangeProgressStyle = CSSProperties & {
  '--pf-range-progress': string;
};

export function getRangeProgressStyle(value: number, min: number, max: number): RangeProgressStyle {
  const span = Math.max(1, max - min);
  const percentage = Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return { '--pf-range-progress': `${percentage}%` };
}
