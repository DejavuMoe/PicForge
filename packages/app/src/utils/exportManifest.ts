import type { CompressSettings } from '@pic-forge/codecs';
import type { ImageFile } from '../types';
import { FORMAT_OPTIONS } from '../types';
import { replaceExtension } from './fileUtils';
import { getEffectiveSettings, getSettingsHash } from './settingsUtils';

export interface ExportManifestFile {
  sourceId: string;
  originalName: string;
  outputName: string;
  settingsMode: ImageFile['settingsMode'];
  settingsHash: string;
  outputFormat: CompressSettings['outputFormat'];
  quality: CompressSettings['quality'];
  resize: CompressSettings['resize'];
  advanced: CompressSettings['advanced'];
  originalSize: number;
  outputSize: number;
  originalDimensions: string | null;
  outputDimensions: string | null;
  compressionRatio: number | null;
}

export interface ExportManifest {
  app: 'PicForge';
  version: string;
  generatedAt: string;
  totals: {
    fileCount: number;
    originalSize: number;
    outputSize: number;
    savedBytes: number;
  };
  files: ExportManifestFile[];
}

export function getOutputName(file: ImageFile, globalSettings: CompressSettings): string {
  const effectiveSettings = getEffectiveSettings(file, globalSettings);
  const formatOption = FORMAT_OPTIONS.find((f) => f.value === effectiveSettings.outputFormat);
  const ext = formatOption?.extension ?? '.bin';
  return replaceExtension(file.file.name, ext);
}

export function makeUniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let index = 2;
  let candidate = `${base}-${index}${ext}`;
  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

export function createZipName(date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `picforge-${stamp}.zip`;
}

export function createExportManifest(
  files: ImageFile[],
  globalSettings: CompressSettings,
  appVersion: string,
  date = new Date(),
): ExportManifest {
  const doneFiles = files.filter((file) => file.status === 'done' && file.result);
  const usedNames = new Set<string>();
  const manifestFiles = doneFiles.map((file) => {
    const result = file.result;
    const effectiveSettings = getEffectiveSettings(file, globalSettings);
    const settingsHash = getSettingsHash(effectiveSettings);
    const outputName = makeUniqueName(getOutputName(file, globalSettings), usedNames);
    const ratio = result && file.originalSize > 0
      ? Math.round(((file.originalSize - result.size) / file.originalSize) * 100)
      : null;

    return {
      sourceId: file.id,
      originalName: file.file.name,
      outputName,
      settingsMode: file.settingsMode,
      settingsHash,
      outputFormat: effectiveSettings.outputFormat,
      quality: effectiveSettings.quality,
      resize: effectiveSettings.resize,
      advanced: effectiveSettings.advanced,
      originalSize: file.originalSize,
      outputSize: result?.size ?? 0,
      originalDimensions: file.outputMeta
        ? `${file.outputMeta.originalWidth}x${file.outputMeta.originalHeight}`
        : null,
      outputDimensions: file.outputMeta
        ? `${file.outputMeta.outputWidth}x${file.outputMeta.outputHeight}`
        : null,
      compressionRatio: ratio,
    };
  });

  const originalSize = manifestFiles.reduce((total, file) => total + file.originalSize, 0);
  const outputSize = manifestFiles.reduce((total, file) => total + file.outputSize, 0);

  return {
    app: 'PicForge',
    version: appVersion,
    generatedAt: date.toISOString(),
    totals: {
      fileCount: manifestFiles.length,
      originalSize,
      outputSize,
      savedBytes: originalSize - outputSize,
    },
    files: manifestFiles,
  };
}
