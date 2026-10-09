import { saveAs } from 'file-saver';
import { FiDownload, FiFilm, FiImage } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import type { MediaItem, MediaOutput } from '../../motion/media';
import { formatFileSize } from '../../utils/fileUtils';

/**
 * The selected item's files, one row each with its real size. Android always yields a
 * photo and a video; an iOS item yields the halves it was given.
 */
export function MotionOutputs({
  android,
  item,
  output,
}: {
  android: boolean;
  item: MediaItem;
  output?: MediaOutput;
}) {
  const { t } = useTranslation();
  const kinds = (['image', 'video'] as const).filter((kind) => android || !!item[kind]);
  return (
    <div className="pf-output-files">
      {kinds.map((kind) => {
        const blob = output?.[kind];
        const image = kind === 'image';
        return (
          <div className={cx('pf-output-file', blob && 'is-ready')} key={kind}>
            <span className="pf-output-kind" aria-hidden>
              {image ? <FiImage /> : <FiFilm />}
            </span>
            <span className="pf-output-text">
              <span className="pf-output-name">
                {t(image ? 'workbench.photo' : 'workbench.video')}
                <span className="pf-mono">{image ? 'JPG' : 'MP4'}</span>
              </span>
              <span className={cx('pf-output-size', !blob && 'is-pending')}>
                {blob ? formatFileSize(blob.size) : t('workbench.notReady')}
              </span>
            </span>
            <Button
              size="sm"
              className="pf-output-download"
              icon={<FiDownload aria-hidden />}
              disabled={!blob}
              onClick={() => {
                if (blob) saveAs(blob, `${item.name}.${image ? 'jpg' : 'mp4'}`);
              }}
            >
              <span className="pf-output-download-label">
                {t(image ? 'workbench.downloadJpg' : 'workbench.downloadMp4')}
              </span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
