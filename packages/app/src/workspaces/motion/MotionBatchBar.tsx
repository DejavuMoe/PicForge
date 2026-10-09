import { FiDownload } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Button, TextButton } from '../../components/ui/Button';

/** Batch ledger for the serial converters: progress, run/cancel and the ZIP export. */
export function MotionBatchBar({
  android,
  total,
  done,
  pending,
  busy,
  exporting,
  scanning,
  allDone,
  onRun,
  onCancel,
  onExport,
  onNewBatch,
}: {
  android: boolean;
  total: number;
  done: number;
  pending: number;
  busy: boolean;
  exporting: boolean;
  scanning: boolean;
  allDone: boolean;
  onRun: () => void;
  onCancel: () => void;
  onExport: () => void;
  onNewBatch: () => void;
}) {
  const { t } = useTranslation();
  const hasResults = done > 0;
  return (
    <div className="pf-status-bar" role="region" aria-label={t('workbench.batchActions')}>
      {busy && (
        <div
          className="pf-batch-progress"
          role="progressbar"
          aria-label={t('workbench.batchProgress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <span style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </div>
      )}
      <div className="pf-batch-status">
        <span className="pf-batch-count" role="status" aria-live="polite">
          {t('motion.count', { done, total })}
        </span>
        {!busy && allDone && (
          <TextButton
            disabled={exporting}
            onClick={(event) => {
              event.currentTarget.focus();
              onNewBatch();
            }}
          >
            {t('motion.newBatch')}
          </TextButton>
        )}
      </div>
      <div className="pf-motion-actions">
        {busy ? (
          <Button size="lg" onClick={onCancel}>
            {t('workbench.cancelProcessing')}
          </Button>
        ) : (
          pending > 0 && (
            <Button
              size="lg"
              variant={hasResults ? 'secondary' : 'primary'}
              disabled={exporting || scanning}
              onClick={onRun}
            >
              {t(android ? 'workbench.extractFiles' : 'motion.start')}
            </Button>
          )
        )}
        {(hasResults || pending === 0) && (
          <Button
            size="lg"
            variant="primary"
            className="pf-export-button"
            icon={<FiDownload aria-hidden />}
            disabled={!hasResults || exporting || busy}
            onClick={onExport}
          >
            {t(exporting ? 'motion.exporting' : 'workbench.exportCompleted')}
          </Button>
        )}
      </div>
    </div>
  );
}
