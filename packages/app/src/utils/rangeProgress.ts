import type { CSSProperties } from 'react';

export type RangeProgressStyle = CSSProperties & {
  '--pf-range-fraction': number;
};

export function getRangeProgressStyle(value: number, min: number, max: number): RangeProgressStyle {
  const span = max - min;
  const ratio = span > 0 ? (value - min) / span : 0;
  const fraction = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return { '--pf-range-fraction': fraction };
}
