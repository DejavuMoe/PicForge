import { describe, expect, it } from 'vitest';
import { calculateResizeGeometry } from './imageProcessor';

describe('calculateResizeGeometry', () => {
  it('contains within bounds without upscaling', () => {
    expect(calculateResizeGeometry(1000, 500, 500, 500, 'contain')).toEqual({
      targetWidth: 500,
      targetHeight: 250,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1000,
      sourceHeight: 500,
    });

    expect(calculateResizeGeometry(400, 300, 800, 800, 'contain')).toEqual({
      targetWidth: 400,
      targetHeight: 300,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 400,
      sourceHeight: 300,
    });
  });

  it('covers the target bounds by cropping source edges', () => {
    expect(calculateResizeGeometry(1000, 500, 500, 500, 'cover')).toEqual({
      targetWidth: 500,
      targetHeight: 500,
      sourceX: 250,
      sourceY: 0,
      sourceWidth: 500,
      sourceHeight: 500,
    });

    expect(calculateResizeGeometry(500, 1000, 500, 500, 'cover')).toEqual({
      targetWidth: 500,
      targetHeight: 500,
      sourceX: 0,
      sourceY: 250,
      sourceWidth: 500,
      sourceHeight: 500,
    });
  });

  it('stretches to exact target dimensions without cropping', () => {
    expect(calculateResizeGeometry(1000, 500, 720, 1080, 'stretch')).toEqual({
      targetWidth: 720,
      targetHeight: 1080,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1000,
      sourceHeight: 500,
    });
  });
});
