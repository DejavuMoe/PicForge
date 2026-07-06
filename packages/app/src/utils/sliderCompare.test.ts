import { describe, expect, it } from 'vitest';
import { clampSliderPosition, getSliderClipPath, getSliderPointerMode } from './sliderCompare';

describe('sliderCompare', () => {
  it('clamps slider position to supported bounds', () => {
    expect(clampSliderPosition(-10)).toBe(2);
    expect(clampSliderPosition(50)).toBe(50);
    expect(clampSliderPosition(120)).toBe(98);
  });

  it('creates a viewport-based clip path', () => {
    expect(getSliderClipPath(0)).toBe('inset(0 98% 0 0)');
    expect(getSliderClipPath(50)).toBe('inset(0 50% 0 0)');
    expect(getSliderClipPath(100)).toBe('inset(0 2% 0 0)');
  });

  it('uses slider drag everywhere at fit zoom', () => {
    expect(
      getSliderPointerMode({
        zoom: 1,
        sliderPos: 50,
        clientX: 0,
        containerLeft: 100,
        containerWidth: 400,
      }),
    ).toBe('slider');
  });

  it('keeps the slider draggable near the divider when zoomed', () => {
    expect(
      getSliderPointerMode({
        zoom: 2,
        sliderPos: 50,
        clientX: 312,
        containerLeft: 100,
        containerWidth: 400,
      }),
    ).toBe('slider');
  });

  it('uses panning away from the divider when zoomed', () => {
    expect(
      getSliderPointerMode({
        zoom: 2,
        sliderPos: 50,
        clientX: 380,
        containerLeft: 100,
        containerWidth: 400,
      }),
    ).toBe('pan');
  });
});
