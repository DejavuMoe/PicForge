import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';

export function cloneSettings(settings: CompressSettings): CompressSettings {
  return {
    ...settings,
    resize: settings.resize ? { ...settings.resize } : undefined,
    advanced: settings.advanced ? { ...settings.advanced } : undefined,
  };
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

  return merged;
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

export function getSettingsHash(settings: CompressSettings): string {
  const serialized = stableStringify(settings);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(i);
  }
  return `s${(hash >>> 0).toString(36)}`;
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
