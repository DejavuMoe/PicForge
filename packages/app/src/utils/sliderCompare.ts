export type SliderPointerMode = 'slider' | 'pan';

const MIN_SLIDER_POS = 2;
const MAX_SLIDER_POS = 98;
const DEFAULT_HIT_SLOP_PX = 24;

export function clampSliderPosition(sliderPos: number): number {
  return Math.max(MIN_SLIDER_POS, Math.min(MAX_SLIDER_POS, sliderPos));
}

export function getSliderClipPath(sliderPos: number): string {
  const clamped = clampSliderPosition(sliderPos);
  return `inset(0 ${100 - clamped}% 0 0)`;
}

export function getSliderPointerMode(input: {
  zoom: number;
  sliderPos: number;
  clientX: number;
  containerLeft: number;
  containerWidth: number;
  hitSlopPx?: number;
}): SliderPointerMode {
  const {
    zoom,
    sliderPos,
    clientX,
    containerLeft,
    containerWidth,
    hitSlopPx = DEFAULT_HIT_SLOP_PX,
  } = input;

  if (zoom <= 1) return 'slider';
  if (containerWidth <= 0) return 'pan';

  const clamped = clampSliderPosition(sliderPos);
  const sliderX = containerLeft + (clamped / 100) * containerWidth;
  return Math.abs(clientX - sliderX) <= hitSlopPx ? 'slider' : 'pan';
}
