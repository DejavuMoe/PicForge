import { describe, expect, it } from 'vitest';
import { getRangeProgressStyle } from './rangeProgress';

describe('getRangeProgressStyle', () => {
  it('maps a value to a fractional CSS custom property', () => {
    expect(getRangeProgressStyle(75, 0, 100)['--pf-range-fraction']).toBe(0.75);
    expect(getRangeProgressStyle(1, 1, 100)['--pf-range-fraction']).toBe(0);
    expect(getRangeProgressStyle(100, 1, 100)['--pf-range-fraction']).toBe(1);
  });

  it('clamps values outside the range', () => {
    expect(getRangeProgressStyle(-20, 0, 100)['--pf-range-fraction']).toBe(0);
    expect(getRangeProgressStyle(120, 0, 100)['--pf-range-fraction']).toBe(1);
  });

  it('tracks sub-second playback and invalid ranges', () => {
    expect(getRangeProgressStyle(0.3, 0, 0.6)['--pf-range-fraction']).toBe(0.5);
    expect(getRangeProgressStyle(0.6, 0, 0.6)['--pf-range-fraction']).toBe(1);
    expect(getRangeProgressStyle(0, 0, 0)['--pf-range-fraction']).toBe(0);
    expect(getRangeProgressStyle(NaN, 0, 1)['--pf-range-fraction']).toBe(0);
  });
});
