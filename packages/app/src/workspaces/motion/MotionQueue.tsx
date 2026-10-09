import { useTranslation } from 'react-i18next';
import { cx } from '../../components/ui/cx';
import { StatusGlyph } from '../../components/ui/StatusGlyph';
import { QueuePanel } from '../../components/workbench/QueuePanel';
import type { MediaItem } from '../../motion/media';
import { formatFileSize } from '../../utils/fileUtils';
import { itemError, itemGlyph, itemStatusKey, thumbSource, type Job } from './jobs';
import { Thumbnail } from './Thumbnail';

export function MotionQueue({
  android,
  items,
  jobs,
  selectedId,
  locked,
  clearDisabled,
  onAdd,
  onClear,
  onSelect,
}: {
  android: boolean;
  items: MediaItem[];
  jobs: Record<string, Job>;
  selectedId?: string;
  /** No more files once processing started or results exist. */
  locked: boolean;
  clearDisabled: boolean;
  onAdd: () => void;
  onClear: () => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <QueuePanel
      title={t(android ? 'workbench.files' : 'workbench.pairs')}
      count={items.length}
      onAdd={onAdd}
      addDisabled={locked}
      clearLabel={t('motion.clear')}
      onClear={onClear}
      clearDisabled={clearDisabled}
    >
      {items.map((item) => {
        const job = jobs[item.id];
        const error = itemError(item, job);
        const selected = selectedId === item.id;
        return (
          <button
            type="button"
            key={item.id}
            className={cx('pf-motion-row', selected && 'is-selected')}
            aria-pressed={selected}
            onClick={() => onSelect(item.id)}
          >
            <Thumbnail blob={thumbSource(item, job)} />
            <span className="pf-motion-row-content">
              <strong>{item.name}</strong>
              <span className="pf-file-status-line">
                <StatusGlyph status={itemGlyph(item, job)} progress={job?.progress} />
                <span
                  className={cx(
                    'pf-motion-row-status',
                    error === 'cancelled'
                      ? 'is-cancelled'
                      : error
                        ? 'is-error'
                        : job?.status === 'done' && 'is-done',
                  )}
                >
                  {t(itemStatusKey(item, job))}
                </span>
                <span className="pf-motion-row-meta">
                  <span aria-hidden>·</span>
                  {android
                    ? formatFileSize(item.image?.size ?? 0)
                    : item.image && item.video
                      ? t('motion.pair')
                      : t(item.image ? 'motion.still' : 'motion.video')}
                </span>
              </span>
              {job?.status === 'processing' && (
                <span className="pf-file-row-progress" aria-hidden>
                  <span style={{ width: `${job.progress}%` }} />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </QueuePanel>
  );
}
