import { useEffect, useState } from 'react';
import { FiImage } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { PhotoPreview, StillFallback } from '../../components/media/PhotoPreview';
import { VideoPlayer } from '../../components/media/VideoPlayer';
import type { MediaOutput } from '../../motion/media';
import { useBlobUrl } from './useBlobUrl';

/** The converted pair as prints on the stage; downloads live in the inspector. */
export function OutputPreview({
  output,
  name,
  active = true,
}: {
  output: MediaOutput;
  name: string;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const image = useBlobUrl(output.image);
  const video = useBlobUrl(output.video);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [output.video]);
  return (
    <div className="pf-motion-output">
      {output.image && (
        <figure className="pf-motion-media-pane" data-kind="image">
          <figcaption>
            <span>{t('workbench.photo')}</span>
            <span className="pf-mono">JPG</span>
          </figcaption>
          {image && (
            <PhotoPreview
              key={image}
              src={image}
              label={`${name} — ${t('workbench.photo')}`}
              active={active}
            />
          )}
        </figure>
      )}
      {output.video && (
        <figure className="pf-motion-media-pane" data-kind="video">
          <figcaption>
            <span>{t('workbench.video')}</span>
            <span className="pf-mono">MP4</span>
          </figcaption>
          {previewFailed && image ? (
            <StillFallback
              key={image}
              src={image}
              label={name}
              note={t('motion.previewUnavailable')}
              active={active}
            />
          ) : (
            <div className="pf-motion-media-frame">
              {video && !previewFailed ? (
                <VideoPlayer
                  key={video}
                  src={video}
                  poster={image}
                  label={`${name} — ${t('workbench.video')}`}
                  active={active}
                  onError={() => setPreviewFailed(true)}
                />
              ) : image ? (
                <img src={image} alt={name} />
              ) : (
                <FiImage className="pf-media-placeholder" aria-hidden />
              )}
            </div>
          )}
          {previewFailed && !image && (
            <p className="pf-motion-preview-note" role="status">
              {t('motion.previewUnavailable')}
            </p>
          )}
        </figure>
      )}
    </div>
  );
}
