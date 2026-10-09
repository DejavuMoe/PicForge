import type { CSSProperties, ReactNode } from 'react';
import { FiArrowLeft, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui/IconButton';

/**
 * Stage title bar: back to the queue (tablet/phone), the item and its facts, the item's
 * place in the queue and a hairline that fills while it is being processed.
 */
export function StageHeader({
  title,
  facts,
  status,
  progress,
  index,
  total,
  onBack,
  onPrev,
  onNext,
}: {
  title: string;
  facts?: ReactNode;
  /** Live processing state, shown before the pager. */
  status?: ReactNode;
  /** 0–100 while processing; omitted otherwise. */
  progress?: number;
  index: number;
  total: number;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="pf-preview-header">
      <div className="pf-preview-nav">
        <IconButton
          className="pf-preview-back"
          label={t('preview.backToList')}
          icon={<FiArrowLeft aria-hidden />}
          onClick={onBack}
        />
        <div className="pf-preview-file-heading">
          <span className="pf-preview-filename" data-tooltip={title}>
            {title}
          </span>
          {facts && <span className="pf-preview-file-facts">{facts}</span>}
        </div>
        {status}
        <div className="pf-preview-pagination">
          <span className="pf-pager-count" aria-hidden>
            {index + 1}
            <span>/</span>
            {total}
          </span>
          <IconButton
            size="sm"
            label={t('preview.previous')}
            icon={<FiChevronLeft aria-hidden />}
            disabled={index <= 0}
            onClick={onPrev}
          />
          <IconButton
            size="sm"
            label={t('preview.next')}
            icon={<FiChevronRight aria-hidden />}
            disabled={index >= total - 1}
            onClick={onNext}
          />
        </div>
      </div>
      {progress !== undefined && (
        <span
          className="pf-stage-progress"
          style={{ '--pf-progress': Math.max(0, Math.min(100, progress)) / 100 } as CSSProperties}
          aria-hidden
        />
      )}
    </header>
  );
}
