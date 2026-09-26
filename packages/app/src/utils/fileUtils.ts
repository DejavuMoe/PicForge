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
 * Replace file extension.
 */
export function replaceExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.');
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot);
  return `${base}${newExt}`;
}

/**
 * Strip path components, control characters, and other zip/download-unsafe chars.
 * Matches the Motion workspace sanitizer: `[\\/:*?"<>|\\x00-\\x1f]`, lone dots, empty fallback.
 * Does not mutate the original File name.
 */
export function sanitizeFileName(filename: string, fallback = 'image'): string {
  const basename = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = basename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+$/, '_');
  const trimmed = cleaned.trim();
  return trimmed || fallback;
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImage(file: File): boolean {
  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/apng',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
  ];
  return (
    supportedTypes.includes(file.type) || /\.(jpe?g|a?png|webp|avif|gif|bmp|svg)$/i.test(file.name)
  );
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

/** Relative paths of files read from dropped folders (File.webkitRelativePath stays empty). */
const droppedPaths = new WeakMap<File, string>();

/** Folder-relative path of a picked or dropped file, falling back to its name. */
export function getRelativePath(file: File): string {
  return file.webkitRelativePath || droppedPaths.get(file) || file.name;
}

/** Upper bound on files collected from one drop, so a huge folder cannot stall the page. */
const MAX_DROPPED_FILES = 10_000;

/**
 * Collect every file of a drop, descending into dropped folders. Entries must be
 * taken from `dataTransfer.items` synchronously, during the drop event itself; the
 * returned promise then reads folders. Callers filter by type.
 */
export function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  const direct: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) direct.push(file);
    }
  }
  if (entries.length === 0 && direct.length === 0) {
    return Promise.resolve(Array.from(dataTransfer.files ?? []));
  }
  return (async () => {
    const files = [...direct];
    for (const entry of entries) {
      if (files.length >= MAX_DROPPED_FILES) break;
      // An unreadable entry (permissions, vanished file) must not discard the rest.
      files.push(...(await readEntry(entry, MAX_DROPPED_FILES - files.length).catch(() => [])));
    }
    return files.slice(0, MAX_DROPPED_FILES);
  })();
}

/**
 * Recursively read files from a FileSystemEntry.
 */
async function readEntry(entry: FileSystemEntry, limit: number): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    if (!file) return [];
    // fullPath is "/folder/name"; keep it relative like webkitRelativePath.
    if (entry.fullPath.includes('/', 1)) droppedPaths.set(file, entry.fullPath.replace(/^\//, ''));
    return [file];
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(dirReader);
    const files: File[] = [];
    for (const childEntry of entries) {
      if (files.length >= limit) break;
      files.push(...(await readEntry(childEntry, limit - files.length).catch(() => [])));
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
