import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { StatusGlyph } from '../../components/ui/StatusGlyph';
import { StageHeader } from '../../components/workbench/StageHeader';
import type { MediaItem } from '../../motion/media';
import { formatFileSize } from '../../utils/fileUtils';
import { itemError, itemGlyph, itemStatusKey, thumbSource, type Job } from './jobs';
import { OutputPreview } from './OutputPreview';
import { Thumbnail } from './Thumbnail';

export function MotionViewer({
  android,
  item,
  job,
  index,
  total,
  active,
  canRetry,
  retryDisabled,
  onRetry,
  onBack,
  onPrev,
  onNext,
}: {
  android: boolean;
  item: MediaItem;
  job?: Job;
  index: number;
  total: number;
  active: boolean;
  canRetry: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const error = itemError(item, job);
  const sources = [item.image?.name, item.video?.name].filter(Boolean).join(' + ');
  return (
    <div className="pf-motion-viewer">
      <StageHeader
        title={item.name}
        facts={
          <span>
            {android
              ? formatFileSize(item.image?.size ?? 0)
              : item.image && item.video
                ? t('motion.pair')
                : t(item.image ? 'motion.still' : 'motion.video')}
          </span>
        }
        progress={job?.status === 'processing' ? job.progress : undefined}
        index={index}
        total={total}
        onBack={onBack}
        onPrev={onPrev}
        onNext={onNext}
      />
      {job?.output ? (
        <OutputPreview key={item.id} output={job.output} name={item.name} active={active} />
      ) : (
        <div className="pf-motion-waiting">
          <Thumbnail blob={thumbSource(item, job)} large />
          <h2>
            <StatusGlyph status={itemGlyph(item, job)} progress={job?.progress} />
            {t(itemStatusKey(item, job))}
          </h2>
          {error ? (
            <p
              className={error === 'cancelled' ? 'pf-field-hint' : 'pf-field-error'}
              role={error === 'cancelled' ? 'status' : 'alert'}
            >
              {t(`motion.errors.${error}`, {
                defaultValue: t('motion.errors.engineFailed'),
              })}
            </p>
          ) : (
            <p className="pf-motion-sources">{sources}</p>
          )}
          {job?.status === 'processing' && (
            <progress max={100} value={job.progress} aria-label={t('motion.processing')} />
          )}
          {canRetry && (
            <Button disabled={retryDisabled} onClick={onRetry}>
              {t('workbench.retryUnfinished')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
