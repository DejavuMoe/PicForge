import { describe, expect, it } from 'vitest';
import { getRangeProgressStyle } from './rangeProgress';

describe('getRangeProgressStyle', () => {
  it('maps a value to a percentage CSS custom property', () => {
    expect(getRangeProgressStyle(75, 0, 100)['--pf-range-progress']).toBe('75%');
    expect(getRangeProgressStyle(1, 1, 100)['--pf-range-progress']).toBe('0%');
    expect(getRangeProgressStyle(100, 1, 100)['--pf-range-progress']).toBe('100%');
  });

  it('clamps values outside the range', () => {
    expect(getRangeProgressStyle(-20, 0, 100)['--pf-range-progress']).toBe('0%');
    expect(getRangeProgressStyle(120, 0, 100)['--pf-range-progress']).toBe('100%');
  });
});
