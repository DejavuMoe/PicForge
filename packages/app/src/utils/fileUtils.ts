/**
 * File utility functions.
 */

/**
 * Generate a unique ID for file tracking.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Format file size into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Calculate compression ratio as a percentage.
 */
export function compressionRatio(original: number, compressed: number): number {
  if (original === 0) return 0;
  return Math.round(((original - compressed) / original) * 100);
}

/**
 * Get file extension from a filename.
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot);
}

/**
 * Replace file extension.
 */
export function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.');
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot);
  return `${base}${newExt}`;
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImage(file: File): boolean {
  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
  ];
  return supportedTypes.includes(file.type) || /\.(jpe?g|png|webp|avif|gif|bmp|svg)$/i.test(file.name);
}

/**
 * Create an object URL for a file or blob, with cleanup tracking.
 */
export function createPreviewUrl(source: File | Blob): string {
  return URL.createObjectURL(source);
}

/**
 * Revoke an object URL to free memory.
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Extract all image files from a FileList, including from dropped folders.
 */
export async function extractFiles(fileList: FileList | File[]): Promise<File[]> {
  const files: File[] = [];
  const entries: FileSystemEntry[] = [];

  for (const file of Array.from(fileList)) {
    // Check if this file has a webkitGetAsEntry (drag-and-drop)
    const entry = (file as { _entry?: FileSystemEntry })._entry;
    if (entry) {
      entries.push(entry);
    } else if (isSupportedImage(file)) {
      files.push(file);
    }
  }

  // Process folder entries recursively
  for (const entry of entries) {
    const entryFiles = await readEntry(entry);
    files.push(...entryFiles);
  }

  return files;
}

/**
 * Recursively read files from a FileSystemEntry.
 */
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return file && isSupportedImage(file) ? [file] : [];
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(dirReader);
    const files: File[] = [];
    for (const childEntry of entries) {
      const childFiles = await readEntry(childEntry);
      files.push(...childFiles);
    }
    return files;
  }

  return [];
}

/**
 * Read a FileSystemFileEntry into a File.
 */
function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

/**
 * Read all entries from a directory reader (handles batched reads).
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const allEntries: FileSystemEntry[] = [];

    function readBatch() {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch(); // Continue reading (Chrome batches ~100 entries at a time)
          }
        },
        (error) => reject(error),
      );
    }

    readBatch();
  });
}
