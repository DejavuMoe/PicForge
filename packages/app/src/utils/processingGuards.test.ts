import { describe, expect, it } from 'vitest';
import {
  estimateDecodedBytes,
  getImageSafetyLimits,
  getMainPipelineConcurrency,
  isPermanentImageError,
  PERMANENT_IMAGE_ERROR_PREFIX,
  runWithConcurrency,
  validateImageDimensions,
  validateImageTarget,
} from './processingGuards';

describe('processingGuards', () => {
  it('uses conservative main-thread concurrency for low-resource devices', () => {
    expect(getMainPipelineConcurrency({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe(1);
    expect(getMainPipelineConcurrency({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(1);
    expect(getMainPipelineConcurrency({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(2);
  });

  it('uses lower pixel limits for low-resource devices', () => {
    expect(getImageSafetyLimits({ hardwareConcurrency: 4, deviceMemory: 8 }).maxPixels).toBe(
      24_000_000,
    );
    expect(getImageSafetyLimits({ hardwareConcurrency: 8, deviceMemory: 8 }).maxPixels).toBe(
      50_000_000,
    );
  });

  it('estimates decoded RGBA memory', () => {
    expect(estimateDecodedBytes({ width: 100, height: 50 })).toBe(20_000);
  });

  it('validates dimensions against per-side and pixel limits', () => {
    const limits = {
      maxDimension: 1_000,
      maxPixels: 500_000,
      maxDecodedBytes: 2_000_000,
    };

    expect(validateImageDimensions({ width: 800, height: 600 }, limits)).toBeNull();
    expect(validateImageDimensions({ width: 1_001, height: 100 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateImageDimensions({ width: 900, height: 900 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateImageDimensions({ width: 0, height: 100 }, limits)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
  });

  it('rejects an oversized target before allocation', () => {
    const limits = {
      maxDimension: 16_384,
      maxPixels: 50_000_000,
      maxDecodedBytes: 200_000_000,
    };
    const error = validateImageTarget(
      { width: 100, height: 100 },
      {
        enabled: true,
        mode: 'absolute',
        maxWidth: 10_000,
        maxHeight: 10_000,
        percentage: 50,
        method: 'stretch',
      },
      limits,
    );

    expect(error).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    expect(isPermanentImageError(error!)).toBe(true);
  });

  it('applies the device pixel policy to the resize target', () => {
    const low = { maxDimension: 16_384, maxPixels: 24_000_000, maxDecodedBytes: 96_000_000 };
    const high = { maxDimension: 16_384, maxPixels: 50_000_000, maxDecodedBytes: 200_000_000 };
    const target25mp = {
      enabled: true,
      mode: 'absolute',
      maxWidth: 5000,
      maxHeight: 5000,
      percentage: 50,
      method: 'stretch',
    } as const;

    expect(validateImageTarget({ width: 100, height: 100 }, target25mp, low)).toContain(
      PERMANENT_IMAGE_ERROR_PREFIX,
    );
    expect(validateImageTarget({ width: 100, height: 100 }, target25mp, high)).toBeNull();
  });

  it('accepts legal 1920 contain output, odd cover crops and disabled resize', () => {
    const limits = { maxDimension: 16_384, maxPixels: 50_000_000, maxDecodedBytes: 200_000_000 };

    expect(
      validateImageTarget(
        { width: 4000, height: 3000 },
        {
          enabled: true,
          mode: 'absolute',
          maxWidth: 1920,
          maxHeight: 1920,
          percentage: 50,
          method: 'contain',
        },
        limits,
      ),
    ).toBeNull();
    expect(
      validateImageTarget(
        { width: 4000, height: 3000 },
        {
          enabled: true,
          mode: 'absolute',
          maxWidth: 1921,
          maxHeight: 1081,
          percentage: 50,
          method: 'cover',
        },
        limits,
      ),
    ).toBeNull();
    expect(
      validateImageTarget(
        { width: 4000, height: 3000 },
        {
          enabled: false,
          mode: 'absolute',
          maxWidth: 10_000,
          maxHeight: 10_000,
          percentage: 50,
          method: 'stretch',
        },
        limits,
      ),
    ).toBeNull();
  });

  it('rejects non-finite resize targets', () => {
    const limits = { maxDimension: 16_384, maxPixels: 50_000_000, maxDecodedBytes: 200_000_000 };
    for (const [maxWidth, maxHeight] of [
      [Number.NaN, 100],
      [Number.POSITIVE_INFINITY, 100],
      [100, Number.NaN],
    ]) {
      expect(
        validateImageTarget(
          { width: 100, height: 100 },
          {
            enabled: true,
            mode: 'absolute',
            maxWidth,
            maxHeight,
            percentage: 50,
            method: 'stretch',
          },
          limits,
        ),
      ).toContain(PERMANENT_IMAGE_ERROR_PREFIX);
    }
  });

  it('detects permanent image errors', () => {
    expect(isPermanentImageError(`${PERMANENT_IMAGE_ERROR_PREFIX}: too large`)).toBe(true);
    expect(isPermanentImageError('Codec failed')).toBe(false);
    expect(isPermanentImageError('Animation: format')).toBe(true);
    expect(isPermanentImageError()).toBe(false);
  });

  it('runs work with bounded concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const visited: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      visited.push(item);
      await Promise.resolve();
      active -= 1;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(visited.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
