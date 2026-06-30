import { describe, it, expect } from 'vitest';
import { formatFileSize, compressionRatio, getExtension, replaceExtension, isSupportedImage } from './fileUtils';

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(2621440)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('compressionRatio', () => {
  it('returns 0 when original is 0', () => {
    expect(compressionRatio(0, 100)).toBe(0);
  });

  it('calculates ratio correctly', () => {
    expect(compressionRatio(1000, 500)).toBe(50);
    expect(compressionRatio(1000, 750)).toBe(25);
    expect(compressionRatio(1000, 1000)).toBe(0);
  });

  it('handles larger compressed than original', () => {
    expect(compressionRatio(1000, 1200)).toBe(-20);
  });
});

describe('getExtension', () => {
  it('returns extension with dot', () => {
    expect(getExtension('photo.jpg')).toBe('.jpg');
    expect(getExtension('image.png')).toBe('.png');
  });

  it('returns empty string for no extension', () => {
    expect(getExtension('README')).toBe('');
  });

  it('handles multiple dots', () => {
    expect(getExtension('archive.tar.gz')).toBe('.gz');
  });
});

describe('replaceExtension', () => {
  it('replaces extension', () => {
    expect(replaceExtension('photo.jpg', '.webp')).toBe('photo.webp');
    expect(replaceExtension('image.png', '.avif')).toBe('image.avif');
  });

  it('adds extension when none exists', () => {
    expect(replaceExtension('README', '.md')).toBe('README.md');
  });

  it('handles multiple dots', () => {
    expect(replaceExtension('archive.tar.gz', '.zip')).toBe('archive.tar.zip');
  });
});

describe('isSupportedImage', () => {
  function makeFile(name: string, type: string): File {
    return new File([''], name, { type });
  }

  it('accepts supported MIME types', () => {
    expect(isSupportedImage(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isSupportedImage(makeFile('a.png', 'image/png'))).toBe(true);
    expect(isSupportedImage(makeFile('a.webp', 'image/webp'))).toBe(true);
    expect(isSupportedImage(makeFile('a.avif', 'image/avif'))).toBe(true);
    expect(isSupportedImage(makeFile('a.gif', 'image/gif'))).toBe(true);
    expect(isSupportedImage(makeFile('a.bmp', 'image/bmp'))).toBe(true);
  });

  it('accepts by extension when MIME type is empty', () => {
    expect(isSupportedImage(makeFile('photo.jpg', ''))).toBe(true);
    expect(isSupportedImage(makeFile('photo.jpeg', ''))).toBe(true);
    expect(isSupportedImage(makeFile('photo.png', ''))).toBe(true);
    expect(isSupportedImage(makeFile('photo.webp', ''))).toBe(true);
  });

  it('rejects unsupported types', () => {
    expect(isSupportedImage(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
    expect(isSupportedImage(makeFile('video.mp4', 'video/mp4'))).toBe(false);
  });
});
