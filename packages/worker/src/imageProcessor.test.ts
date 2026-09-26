import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERMANENT_IMAGE_ERROR_PREFIX,
  calculateResizeGeometry,
  decodeAndResizeImage,
  downscaleScratchPixels,
  downscaleSteps,
  drawScaled,
  resizeImage,
  resolveResizeGeometry,
  validateResizeOptions,
  validateResizeTarget,
  validateSourceDimensions,
} from './imageProcessor';

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

describe('resolveResizeGeometry', () => {
  it('resolves absolute percentage and disabled options through one rounding path', () => {
    expect(
      resolveResizeGeometry(2400, 1600, {
        enabled: true,
        mode: 'absolute',
        maxWidth: 1920,
        maxHeight: 1080,
        percentage: 50,
        method: 'contain',
      }),
    ).toEqual({
      targetWidth: 1620,
      targetHeight: 1080,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 2400,
      sourceHeight: 1600,
    });

    expect(
      resolveResizeGeometry(2400, 1600, {
        enabled: true,
        mode: 'percentage',
        maxWidth: 1,
        maxHeight: 1,
        percentage: 50,
        method: 'contain',
      }),
    ).toEqual({
      targetWidth: 1200,
      targetHeight: 800,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 2400,
      sourceHeight: 1600,
    });

    expect(
      resolveResizeGeometry(400, 300, {
        enabled: false,
        mode: 'absolute',
        maxWidth: 1920,
        maxHeight: 1080,
        percentage: 50,
        method: 'cover',
      }),
    ).toEqual({
      targetWidth: 400,
      targetHeight: 300,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 400,
      sourceHeight: 300,
    });
  });
});

describe('validateResizeTarget', () => {
  const limits = { maxDimension: 16_384, maxPixels: 50_000_000 };

  it('accepts legal absolute, cover and odd targets', () => {
    expect(
      validateResizeTarget(
        calculateResizeGeometry(4000, 3000, 1920, 1920, 'contain'),
        limits,
      ),
    ).toBeNull();
    expect(
      validateResizeTarget(calculateResizeGeometry(4000, 3000, 1921, 1081, 'cover'), limits),
    ).toBeNull();
    expect(validateResizeTarget(calculateResizeGeometry(101, 99, 51, 49, 'cover'), limits)).toBeNull();
  });

  it('rejects oversized and non-finite targets with the permanent prefix', () => {
    const empty = {
      targetWidth: 0,
      targetHeight: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1,
      sourceHeight: 1,
    };
    expect(validateResizeTarget(empty, limits)).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateResizeTarget({ ...empty, targetWidth: NaN, targetHeight: 10 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(
      validateResizeTarget({ ...empty, targetWidth: Infinity, targetHeight: 10 }, limits),
    ).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateResizeTarget({ ...empty, targetWidth: 10_000, targetHeight: 10_000 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateResizeTarget({ ...empty, targetWidth: 20_000, targetHeight: 1 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
  });

  it('rejects an oversized stretch before allocating any canvas', () => {
    const created: string[] = [];
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        created.push(tag);
        return {};
      }),
    });
    try {
      expect(() =>
        resizeImage(new Uint8ClampedArray(16), 2, 2, {
          enabled: true,
          mode: 'absolute',
          maxWidth: 10_000,
          maxHeight: 10_000,
          percentage: 50,
          method: 'stretch',
        }),
      ).toThrow(PERMANENT_IMAGE_ERROR_PREFIX);
      expect(created).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function mockBrowser(width: number, height: number) {
  const canvases: Array<{ width: number; height: number }> = [];
  let size = { width, height };
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_value: string) {
      this.naturalWidth = size.width;
      this.naturalHeight = size.height;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return '';
    }
  }
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('document', {
    createElement: vi.fn(() => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage: vi.fn(),
          getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          })),
        })),
      };
      canvases.push(canvas);
      return canvas;
    }),
  });
  return { canvases, setImageSize: (w: number, h: number) => (size = { width: w, height: h }) };
}

const enabled = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  mode: 'absolute' as const,
  maxWidth: 1920,
  maxHeight: 1080,
  percentage: 50,
  method: 'contain' as const,
  ...overrides,
});

describe('validateResizeOptions', () => {
  it('accepts disabled resize and unused inactive fields', () => {
    expect(validateResizeOptions(undefined)).toBeNull();
    expect(validateResizeOptions(enabled({ enabled: false, maxWidth: 0, maxHeight: 0 }))).toBeNull();
    expect(
      validateResizeOptions(enabled({ mode: 'percentage', maxWidth: 0, maxHeight: 0, percentage: 50 })),
    ).toBeNull();
  });

  it('rejects non-finite, zero or negative active parameters', () => {
    for (const value of [0, -10, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(validateResizeOptions(enabled({ maxWidth: value }))).toContain(
        PERMANENT_IMAGE_ERROR_PREFIX,
      );
    }
    expect(validateResizeOptions(enabled({ maxHeight: 0 }))).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateResizeOptions(enabled({ mode: 'percentage', percentage: 0 }))).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateResizeOptions(enabled({ mode: 'percentage', percentage: Number.NaN }))).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
  });

  it('rejects unsupported mode and method', () => {
    expect(validateResizeOptions(enabled({ mode: 'bogus' as never }))).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateResizeOptions(enabled({ method: 'bogus' as never }))).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
  });
});

describe('validateSourceDimensions', () => {
  const limits = { maxDimension: 16_384, maxPixels: 50_000_000 };

  it('enforces exact and just-over source boundaries', () => {
    expect(validateSourceDimensions(5000, 10_000, limits)).toBeNull();
    expect(validateSourceDimensions(5001, 10_000, limits)).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateSourceDimensions(10_000, 6000, limits)).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateSourceDimensions(16_384, 100, limits)).toBeNull();
    expect(validateSourceDimensions(16_385, 100, limits)).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(validateSourceDimensions(Number.NaN, 100, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
  });
});

describe('decodeAndResizeImage allocation boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a 60 MP source before target allocation', async () => {
    const { canvases, setImageSize } = mockBrowser(10_000, 6000);
    setImageSize(10_000, 6000);
    await expect(
      decodeAndResizeImage(new Blob([new Uint8Array(4)]), enabled()),
    ).rejects.toThrow(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(canvases).toHaveLength(0);
  });

  it('rejects a 100 MP target before any canvas', async () => {
    const { canvases } = mockBrowser(100, 100);
    await expect(
      decodeAndResizeImage(
        new Blob([new Uint8Array(4)]),
        enabled({ maxWidth: 10_000, maxHeight: 10_000, method: 'stretch' }),
      ),
    ).rejects.toThrow(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(canvases).toHaveLength(0);
  });

  it('rejects invalid active settings before any canvas', async () => {
    for (const bad of [
      enabled({ maxWidth: 0 }),
      enabled({ maxHeight: -1 }),
      enabled({ maxWidth: Number.POSITIVE_INFINITY }),
      enabled({ mode: 'percentage', percentage: Number.NaN }),
      enabled({ method: 'bogus' as never }),
      enabled({ mode: 'bogus' as never }),
    ]) {
      const { canvases } = mockBrowser(100, 100);
      await expect(decodeAndResizeImage(new Blob([new Uint8Array(4)]), bad)).rejects.toThrow(
        PERMANENT_IMAGE_ERROR_PREFIX,
      );
      expect(canvases).toHaveLength(0);
      vi.unstubAllGlobals();
    }
  });

  it('accepts odd dimensions, fractional percentage and every resize mode', async () => {
    const { canvases } = mockBrowser(101, 99);
    for (const method of ['contain', 'cover', 'stretch'] as const) {
      const result = await decodeAndResizeImage(
        new Blob([new Uint8Array(4)]),
        enabled({ maxWidth: 51, maxHeight: 49, method }),
      );
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    }
    const percentage = await decodeAndResizeImage(
      new Blob([new Uint8Array(4)]),
      enabled({ mode: 'percentage', percentage: 33.5 }),
    );
    expect(percentage.width).toBeGreaterThan(0);
    // Four targets plus halving steps: contain/stretch 99 -> 49 rows and the percentage case.
    expect(canvases).toHaveLength(7);
    // URL and canvas cleanup runs on success.
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('cleans up the canvas on a post-load draw failure', async () => {
    const { canvases } = mockBrowser(100, 100);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => null),
        };
        canvases.push(canvas as never);
        return canvas;
      }),
    });
    await expect(
      decodeAndResizeImage(new Blob([new Uint8Array(4)]), enabled()),
    ).rejects.toThrow('Failed to get 2D canvas context');
    expect(canvases).toHaveLength(1);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });
});

describe('stepped downscale', () => {
  function recorder() {
    const draws: unknown[][] = [];
    const canvases: Array<{ width: number; height: number }> = [];
    const context = () => ({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'medium',
      drawImage: (...args: unknown[]) => draws.push(args),
    });
    const stepContexts: Array<ReturnType<typeof context>> = [];
    const createCanvas = (width: number, height: number) => {
      const step = context();
      stepContexts.push(step);
      const canvas = { width, height, getContext: () => step };
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    };
    return { draws, canvases, stepContexts, ctx: context(), createCanvas };
  }

  it('halves each axis until the final draw is at most 2:1', () => {
    expect(downscaleSteps(4000, 3000, 500, 375)).toEqual([
      { width: 2000, height: 1500 },
      { width: 1000, height: 750 },
    ]);
    expect(downscaleSteps(4000, 3000, 2000, 1500)).toEqual([]);
    expect(downscaleSteps(100, 100, 400, 400)).toEqual([]);
    // Stretch can step one axis only.
    expect(downscaleSteps(1000, 1000, 1000, 100)).toEqual([
      { width: 1000, height: 500 },
      { width: 1000, height: 250 },
      { width: 1000, height: 125 },
    ]);
    expect(downscaleScratchPixels(4000, 3000, 500, 375)).toBe(2000 * 1500 + 1000 * 750);
    expect(downscaleScratchPixels(4000, 3000, 2000, 1500)).toBe(0);
  });

  it('keeps the crop rectangle and target, then releases every scratch canvas', () => {
    const { draws, canvases, stepContexts, ctx, createCanvas } = recorder();
    const source = { id: 'source' } as unknown as CanvasImageSource;
    const geometry = {
      targetWidth: 500,
      targetHeight: 500,
      sourceX: 500,
      sourceY: 0,
      sourceWidth: 3000,
      sourceHeight: 3000,
    };
    drawScaled(ctx as never, source, geometry, createCanvas);
    expect(draws).toHaveLength(3);
    expect(draws[0]).toEqual([source, 500, 0, 3000, 3000, 0, 0, 1500, 1500]);
    expect(draws[1].slice(1)).toEqual([0, 0, 1500, 1500, 0, 0, 750, 750]);
    expect(draws[2].slice(1)).toEqual([0, 0, 750, 750, 0, 0, 500, 500]);
    // Exact halvings average 2x2 pixels bilinearly; only the final draw uses 'high'.
    expect(stepContexts.map((step) => step.imageSmoothingQuality)).toEqual(['low', 'low']);
    expect(stepContexts.every((step) => step.imageSmoothingEnabled)).toBe(true);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('draws once without scratch canvases for the direct strategy', () => {
    const { draws, canvases, ctx, createCanvas } = recorder();
    const source = { id: 'source' } as unknown as CanvasImageSource;
    drawScaled(
      ctx as never,
      source,
      { targetWidth: 500, targetHeight: 375, sourceX: 0, sourceY: 0, sourceWidth: 4000, sourceHeight: 3000 },
      createCanvas,
      'direct',
    );
    expect(draws).toEqual([[source, 0, 0, 4000, 3000, 0, 0, 500, 375]]);
    expect(canvases).toHaveLength(0);
  });
});
