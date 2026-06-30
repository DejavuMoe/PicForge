import { describe, expect, it } from 'vitest';
import { PREVIEW_TEST_IDS } from './previewLayers';

describe('previewLayers', () => {
  it('keeps stable layer test ids unique', () => {
    const ids = Object.values(PREVIEW_TEST_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes separate contracts for image, overlay, and toolbar layers', () => {
    expect(PREVIEW_TEST_IDS.previewImage).toBe('preview-image');
    expect(PREVIEW_TEST_IDS.paneOverlayLayer).toBe('preview-pane-overlay-layer');
    expect(PREVIEW_TEST_IDS.toolbarLayer).toBe('preview-toolbar-layer');
  });
});
