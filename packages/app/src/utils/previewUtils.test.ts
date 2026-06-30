import { describe, expect, it } from 'vitest';
import { getDefaultCompareMode, isCompareModeAvailable } from './previewUtils';

describe('previewUtils', () => {
  it('uses single view before a result exists', () => {
    expect(getDefaultCompareMode({
      hasResult: false,
      hasDimensionChange: false,
      isMobile: false,
    })).toBe('single');
  });

  it('uses slider for same-size desktop comparisons', () => {
    expect(getDefaultCompareMode({
      hasResult: true,
      hasDimensionChange: false,
      isMobile: false,
    })).toBe('slider');
  });

  it('uses side-by-side for resized desktop comparisons', () => {
    expect(getDefaultCompareMode({
      hasResult: true,
      hasDimensionChange: true,
      isMobile: false,
    })).toBe('sideBySide');
  });

  it('uses stacked side-by-side on mobile even when dimensions match', () => {
    expect(getDefaultCompareMode({
      hasResult: true,
      hasDimensionChange: false,
      isMobile: true,
    })).toBe('sideBySide');
  });

  it('only allows compare modes after a result exists', () => {
    expect(isCompareModeAvailable('single', false)).toBe(true);
    expect(isCompareModeAvailable('slider', false)).toBe(false);
    expect(isCompareModeAvailable('sideBySide', true)).toBe(true);
  });
});
