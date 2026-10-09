/**
 * Stage layers. Image layers take the pan/zoom transform; overlay layers stay in screen
 * space and only draw in the mat around the fitted image, never over its pixels.
 */

import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { cx } from '../../../components/ui/cx';
import { formatSizeChange } from '../../../utils/fileUtils';
import { PREVIEW_TEST_IDS } from '../../../utils/previewLayers';
import { getSliderClipPath } from '../../../utils/sliderCompare';

export interface ImageMeta {
  label: string;
  src: string;
  size: string;
  dimensions?: string;
  ratio?: number;
}

type PointerHandler = (event: PointerEvent<HTMLElement>) => void;

export const IMAGE_TRANSFORM =
  'translate3d(calc(-50% + var(--preview-pan-x, 0px)), calc(-50% + var(--preview-pan-y, 0px)), 0) scale3d(var(--preview-zoom, 1), var(--preview-zoom, 1), 1)';

export function SideBySideCompareView({
  original,
  output,
  isPanning,
  onPointerDown,
}: {
  original: ImageMeta;
  output: ImageMeta;
  isPanning: boolean;
  onPointerDown: PointerHandler;
}) {
  return (
    <div data-testid={PREVIEW_TEST_IDS.sideBySideRoot} className="pf-preview-side-by-side">
      <PreviewPane image={original} isPanning={isPanning} divider onPointerDown={onPointerDown} />
      <PreviewPane image={output} isPanning={isPanning} onPointerDown={onPointerDown} />
    </div>
  );
}

export function SliderCompareView({
  original,
  output,
  sliderPos,
  onSliderChange,
  isPanning,
  onPointerDown,
}: {
  original: ImageMeta;
  output: ImageMeta;
  sliderPos: number;
  onSliderChange: (value: number) => void;
  isPanning: boolean;
  onPointerDown: PointerHandler;
}) {
  return (
    <div
      data-testid={PREVIEW_TEST_IDS.sliderRoot}
      className="pf-slider-compare"
      onPointerDown={onPointerDown}
    >
      <div data-testid={PREVIEW_TEST_IDS.sliderImageLayer} className="pf-slider-image-layer">
        <PreviewImage src={output.src} alt={output.label} isPanning={isPanning} />
        <div className="pf-slider-clip" style={{ clipPath: getSliderClipPath(sliderPos) }}>
          <PreviewImage src={original.src} alt={original.label} isPanning={isPanning} />
        </div>
      </div>
      <div data-testid={PREVIEW_TEST_IDS.sliderOverlayLayer} className="pf-slider-overlay-layer">
        <span className="pf-slider-line" style={{ left: `${sliderPos}%` }} aria-hidden="true" />
        <button
          type="button"
          className="pf-slider-handle"
          style={{ left: `${sliderPos}%` }}
          role="slider"
          aria-label={`${original.label} / ${output.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sliderPos)}
          onKeyDown={(event) => {
            const delta = event.shiftKey ? 10 : 1;
            const next =
              event.key === 'ArrowLeft'
                ? sliderPos - delta
                : event.key === 'ArrowRight'
                  ? sliderPos + delta
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 100
                      : null;
            if (next !== null) {
              event.preventDefault();
              event.stopPropagation();
              onSliderChange(Math.max(0, Math.min(100, next)));
            }
          }}
        >
          <span className="pf-slider-grip" aria-hidden />
        </button>
        <span className="pf-plate" aria-hidden />
        <PreviewLabel image={original} side="left" isInteracting={isPanning} />
        <PreviewLabel image={output} side="right" isInteracting={isPanning} />
      </div>
    </div>
  );
}

export function SingleImageView({
  image,
  status,
  isPanning,
  onPointerDown,
}: {
  image: ImageMeta;
  /** Processing state drawn in the mat under the image. */
  status?: ReactNode;
  isPanning: boolean;
  onPointerDown: PointerHandler;
}) {
  return (
    <div data-testid={PREVIEW_TEST_IDS.singleRoot} className="pf-preview-single">
      <PreviewPane
        image={image}
        status={status}
        isPanning={isPanning}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

function PreviewPane({
  image,
  status,
  isPanning,
  divider = false,
  onPointerDown,
}: {
  image: ImageMeta;
  status?: ReactNode;
  isPanning: boolean;
  divider?: boolean;
  onPointerDown: PointerHandler;
}) {
  return (
    <div
      data-testid={PREVIEW_TEST_IDS.pane}
      className={cx('pf-preview-pane', divider && 'has-divider')}
      onPointerDown={onPointerDown}
    >
      <div data-testid={PREVIEW_TEST_IDS.paneImageLayer} className="pf-preview-pane-image-layer">
        <PreviewImage src={image.src} alt={image.label} isPanning={isPanning} />
      </div>
      <div
        data-testid={PREVIEW_TEST_IDS.paneOverlayLayer}
        className="pf-preview-pane-overlay-layer"
      >
        <span className="pf-plate" aria-hidden />
        <PreviewLabel image={image} side="left" isInteracting={isPanning} />
        <div
          data-testid={PREVIEW_TEST_IDS.previewInfoBadge}
          className={cx('pf-preview-info-badge', isPanning && 'is-interacting')}
        >
          {image.dimensions && <span className="pf-preview-dimensions">{image.dimensions}</span>}
          {status}
        </div>
      </div>
    </div>
  );
}

function PreviewImage({
  src,
  alt,
  isPanning,
  style,
}: {
  src: string;
  alt: string;
  isPanning: boolean;
  style?: CSSProperties;
}) {
  return (
    <img
      data-testid={PREVIEW_TEST_IDS.previewImage}
      className="pf-preview-image"
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      style={{
        transform: IMAGE_TRANSFORM,
        transition: isPanning ? 'none' : 'transform 0.1s ease',
        ...style,
      }}
    />
  );
}

function PreviewLabel({
  image,
  side,
  isInteracting = false,
}: {
  image: ImageMeta;
  side: 'left' | 'right';
  isInteracting?: boolean;
}) {
  return (
    <span
      data-testid={PREVIEW_TEST_IDS.previewLabel}
      className={cx('pf-preview-label', 'is-top', `is-${side}`, isInteracting && 'is-interacting')}
    >
      <span className="pf-preview-label-name">{image.label}</span>
      <span className="pf-mono">{image.size}</span>
      {image.ratio !== undefined && (
        <span className={cx('pf-mono', 'pf-file-ratio', image.ratio < 0 && 'is-larger')}>
          {formatSizeChange(image.ratio)}
        </span>
      )}
    </span>
  );
}
