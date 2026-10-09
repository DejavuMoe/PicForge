import { useState } from 'react';
import { FiMaximize } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui/IconButton';
import { toggleFullscreen } from '../ui/media';
import { useFittedStrip } from './useFittedStrip';

/** A still with its own strip, fitted to the rendered picture rather than the pane. */
export function PhotoPreview({
  src,
  label,
  active,
}: {
  src: string;
  label: string;
  active: boolean;
}) {
  const { t } = useTranslation();
  const { frame, image } = useFittedStrip(active);
  const [dimensions, setDimensions] = useState('');
  return (
    <div ref={frame} className="pf-motion-media-frame pf-photo-preview">
      <img
        ref={image}
        src={src}
        alt={label}
        onLoad={(event) =>
          setDimensions(
            `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`,
          )
        }
      />
      <div
        className="pf-photo-controls"
        role="group"
        aria-label={t('preview.photoControls')}
        hidden={!dimensions}
      >
        <span className="pf-photo-dimensions">{dimensions}</span>
        <IconButton
          className="pf-photo-fullscreen"
          label={t('preview.photoFullscreen')}
          icon={<FiMaximize aria-hidden />}
          disabled={!document.fullscreenEnabled}
          onClick={() => toggleFullscreen(frame.current)}
        />
      </div>
    </div>
  );
}

/**
 * The still shown in place of a video this browser cannot decode. Its note sits in a
 * strip of the photo strip's height, so the pair keeps one geometry.
 */
export function StillFallback({
  src,
  label,
  note,
  active,
}: {
  src: string;
  label: string;
  note: string;
  active: boolean;
}) {
  const { frame, image } = useFittedStrip(active);
  return (
    <div ref={frame} className="pf-motion-media-frame pf-still-fallback">
      <img ref={image} src={src} alt={label} />
      <p className="pf-motion-preview-note pf-still-note" role="status">
        {note}
      </p>
    </div>
  );
}
