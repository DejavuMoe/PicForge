import { useLayoutEffect, useRef, useState } from 'react';
import { FiMaximize } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

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
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState('');
  useLayoutEffect(() => {
    const element = frame.current;
    const photo = image.current;
    if (!active || !element || !photo) return;
    const fit = () => {
      const bounds = photo.getBoundingClientRect();
      if (!bounds.width || !photo.naturalWidth) return;
      element.style.setProperty('--pf-photo-width', `${bounds.width}px`);
      element.style.setProperty(
        '--pf-photo-bottom',
        `${bounds.bottom - element.getBoundingClientRect().top}px`,
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(photo);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [active]);
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
        <button
          type="button"
          className="pf-icon-control pf-photo-fullscreen"
          aria-label={t('preview.photoFullscreen')}
          data-tooltip={t('preview.photoFullscreen')}
          disabled={!document.fullscreenEnabled}
          onClick={() => {
            const action = document.fullscreenElement
              ? document.exitFullscreen()
              : frame.current?.requestFullscreen();
            void action?.catch(() => undefined);
          }}
        >
          <FiMaximize aria-hidden />
        </button>
      </div>
    </div>
  );
}
