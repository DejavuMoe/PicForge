export function getMissingBrowserFeatures(): string[] {
  const missing: string[] = [];

  if (typeof WebAssembly === 'undefined') missing.push('WebAssembly');
  if (typeof Worker === 'undefined') missing.push('Web Worker');
  if (typeof Blob === 'undefined') missing.push('Blob');
  if (typeof File === 'undefined') missing.push('File API');
  if (typeof FileReader === 'undefined') missing.push('FileReader');
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    missing.push('Object URL');
  }

  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('2d')) missing.push('Canvas 2D');
  } catch {
    missing.push('Canvas 2D');
  }

  return missing;
}
