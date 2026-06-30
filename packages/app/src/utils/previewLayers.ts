/**
 * Stable layer identifiers for preview rendering and browser verification.
 *
 * The preview contract is intentionally simple:
 * - image layers may receive pan/zoom transforms
 * - overlay layers must stay fixed in screen space
 * - toolbar layers must live outside the zoomable viewport
 */

export const PREVIEW_TEST_IDS = {
  toolbarLayer: 'preview-toolbar-layer',
  viewport: 'preview-viewport',
  sideBySideRoot: 'preview-side-by-side-root',
  sliderRoot: 'preview-slider-root',
  singleRoot: 'preview-single-root',
  pane: 'preview-pane',
  paneImageLayer: 'preview-pane-image-layer',
  paneOverlayLayer: 'preview-pane-overlay-layer',
  sliderImageLayer: 'preview-slider-image-layer',
  sliderOverlayLayer: 'preview-slider-overlay-layer',
  previewImage: 'preview-image',
  previewLabel: 'preview-label',
  previewInfoBadge: 'preview-info-badge',
  compareSummary: 'preview-compare-summary',
} as const;

export type PreviewTestId = (typeof PREVIEW_TEST_IDS)[keyof typeof PREVIEW_TEST_IDS];
