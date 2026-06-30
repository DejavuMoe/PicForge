import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMissingBrowserFeatures } from './browserSupport';

function stubModernBrowser() {
  vi.stubGlobal('WebAssembly', {});
  vi.stubGlobal('Worker', class Worker {});
  vi.stubGlobal('Blob', class Blob {});
  vi.stubGlobal('File', class File {});
  vi.stubGlobal('FileReader', class FileReader {});
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test' });
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({}),
    }),
  });
}

describe('browserSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no missing features for the required browser APIs', () => {
    stubModernBrowser();

    expect(getMissingBrowserFeatures()).toEqual([]);
  });

  it('reports missing core APIs', () => {
    stubModernBrowser();
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('FileReader', undefined);
    vi.stubGlobal('URL', {});

    expect(getMissingBrowserFeatures()).toEqual(['Web Worker', 'FileReader', 'Object URL']);
  });

  it('reports missing Canvas 2D support', () => {
    stubModernBrowser();
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => null,
      }),
    });

    expect(getMissingBrowserFeatures()).toContain('Canvas 2D');
  });
});
