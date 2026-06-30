/**
 * Application-level type definitions.
 */

import type { CompressSettings, OutputFormat } from '@pic-forge/codecs';

/**
 * Status of an image file in the processing queue.
 */
export type FileStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * Whether an image follows global settings or owns a full settings snapshot.
 */
export type FileSettingsMode = 'global' | 'custom';

/**
 * Dimensions and settings metadata for the latest processed output.
 */
export interface ImageOutputMeta {
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  settingsHash: string;
}

/**
 * Represents an image file in the processing queue.
 */
export interface ImageFile {
  /** Unique identifier */
  id: string;
  /** Original File object */
  file: File;
  /** Original file size in bytes */
  originalSize: number;
  /** Current processing status */
  status: FileStatus;
  /** Whether this image follows global settings or a custom snapshot */
  settingsMode: FileSettingsMode;
  /** Full custom settings snapshot used when settingsMode is custom */
  customSettings?: CompressSettings;
  /** Hash of the settings used for the latest completed processing result */
  lastProcessedSettingsHash?: string;
  /** Processing progress (0-100) */
  progress: number;
  /** Object URL for the original image preview */
  previewUrl: string;
  /** Processing result (available when status is 'done') */
  result?: {
    /** Compressed image as a Blob */
    blob: Blob;
    /** Compressed file size in bytes */
    size: number;
    /** Object URL for the compressed image preview */
    previewUrl: string;
  };
  /** Metadata for the latest processing result */
  outputMeta?: ImageOutputMeta;
  /** Error message (available when status is 'error') */
  error?: string;
}

/**
 * Display-friendly format option.
 */
export interface FormatOption {
  value: OutputFormat;
  label: string;
  extension: string;
  mimeType: string;
}

/**
 * Supported output format options.
 */
export const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'mozjpeg', label: 'JPEG', extension: '.jpg', mimeType: 'image/jpeg' },
  { value: 'webp', label: 'WebP', extension: '.webp', mimeType: 'image/webp' },
  { value: 'oxipng', label: 'PNG', extension: '.png', mimeType: 'image/png' },
  { value: 'avif', label: 'AVIF', extension: '.avif', mimeType: 'image/avif' },
];
