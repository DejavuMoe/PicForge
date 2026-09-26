import { sanitizeAdvancedOptions, type CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';

export function cloneSettings(settings: CompressSettings): CompressSettings {
  return {
    ...settings,
    resize: settings.resize ? { ...settings.resize } : undefined,
    advanced: settings.advanced ? { ...settings.advanced } : undefined,
  };
}

/**
 * Drop advanced options that do not belong to the active output format. The
 * flat `advanced` object otherwise accumulates keys across format switches and
 * presets, which then leak into another encoder, the settings hash and the
 * export manifest.
 */
export function normalizeSettings(settings: CompressSettings): CompressSettings {
  return {
    ...settings,
    advanced: sanitizeAdvancedOptions(settings.outputFormat, settings.advanced),
  };
}

/**
 * Presets define format, quality and that format's advanced options. They
 * replace the advanced options instead of merging into leftovers, and keep the
 * current resize settings (presets never control resize).
 */
export function applyPresetSettings(
  base: CompressSettings,
  preset: Pick<CompressSettings, 'outputFormat' | 'quality' | 'advanced'>,
): CompressSettings {
  return normalizeSettings({
    ...cloneSettings(base),
    outputFormat: preset.outputFormat,
    quality: preset.quality,
    advanced: { ...(preset.advanced ?? {}) },
  });
}

export function mergeSettings(
  base: CompressSettings,
  partial: Partial<CompressSettings>,
): CompressSettings {
  const merged: CompressSettings = {
    ...base,
    ...partial,
    resize: partial.resize && base.resize
      ? { ...base.resize, ...partial.resize }
      : partial.resize ?? base.resize,
    advanced: partial.advanced && base.advanced
      ? { ...base.advanced, ...partial.advanced }
      : partial.advanced ?? base.advanced,
  };

  if (merged.resize?.percentage !== undefined) {
    merged.resize = {
      ...merged.resize,
      percentage: Math.max(1, Math.min(100, merged.resize.percentage)),
    };
  }

  if (merged.quality !== undefined) {
    merged.quality = Math.max(0, Math.min(100, merged.quality));
  }

  return normalizeSettings(merged);
}

export function getEffectiveSettings(
  file: ImageFile,
  globalSettings: CompressSettings,
): CompressSettings {
  if (file.settingsMode === 'custom' && file.customSettings) {
    return cloneSettings(file.customSettings);
  }
  return cloneSettings(globalSettings);
}

/**
 * Identity of a settings snapshot. It decides whether a stored result still
 * matches the current settings, so it uses a 53-bit hash (cyrb53) instead of a
 * 32-bit one to make an accidental match between two snapshots negligible.
 */
export function getSettingsHash(settings: CompressSettings): string {
  const serialized = stableStringify(settings);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < serialized.length; i += 1) {
    const code = serialized.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `s${hash.toString(36)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(',')}}`;
}
