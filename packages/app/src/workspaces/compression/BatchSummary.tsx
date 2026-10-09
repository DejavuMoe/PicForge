import { useCallback, useState } from 'react';
import { FiDownload } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Button, TextButton } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  createExportManifest,
  createZipName,
  getOutputName,
  isResultExportable,
} from '../../utils/exportManifest';
import { compressionRatio, formatFileSize, formatSizeChange } from '../../utils/fileUtils';

/** Batch ledger: completion, totals and the one export action. */
export function BatchSummary({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const files = useFileStore((state) => state.files);
  const settings = useSettingsStore((state) => state.settings);
  const [isZipping, setIsZipping] = useState(false);
  const [exportError, setExportError] = useState(false);
  const doneFiles = files.filter((file) => isResultExportable(file, settings));
  const processing = files.some(
    (file) => file.status === 'pending' || file.status === 'processing',
  );
  const finished = files.filter((file) =>
    ['done', 'error', 'cancelled'].includes(file.status),
  ).length;
  const failed = files.filter((file) => file.status === 'error').length;
  const sourceBytes = doneFiles.reduce((sum, file) => sum + file.originalSize, 0);
  const resultBytes = doneFiles.reduce((sum, file) => sum + (file.result?.size ?? 0), 0);
  const saving = compressionRatio(sourceBytes, resultBytes);
  const handleDownloadZip = useCallback(async () => {
    const currentSettings = useSettingsStore.getState().settings;
    const exportable = useFileStore
      .getState()
      .files.filter((file) => isResultExportable(file, currentSettings));
    if (exportable.length === 0) return;
    setIsZipping(true);
    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import('jszip'),
        import('file-saver'),
      ]);
      const zip = new JSZip();
      const date = new Date();
      const manifest = createExportManifest(exportable, currentSettings, __APP_VERSION__, date);
      for (const fileEntry of manifest.files) {
        const file = exportable.find((item) => item.id === fileEntry.sourceId);
        if (!file?.result || !isResultExportable(file, currentSettings)) continue;
        zip.file(fileEntry.outputName, file.result.blob);
      }
      zip.file('picforge-manifest.json', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, createZipName(date));
    } catch (err) {
      console.error('Failed to create ZIP:', err);
      setExportError(true);
    } finally {
      setIsZipping(false);
    }
  }, []);

  const exportCompleted = async () => {
    setExportError(false);
    const currentSettings = useSettingsStore.getState().settings;
    const current = useFileStore
      .getState()
      .files.filter((file) => isResultExportable(file, currentSettings));
    if (current.length > 1) {
      await handleDownloadZip();
      return;
    }
    if (current.length === 1) {
      try {
        const { saveAs } = await import('file-saver');
        saveAs(current[0].result!.blob, getOutputName(current[0], currentSettings));
      } catch {
        setExportError(true);
      }
    }
  };
  if (files.length === 0) return null;
  return (
    <div
      className="pf-status-bar"
      data-testid="status-bar"
      role="region"
      aria-label={t('workbench.batchActions')}
    >
      <div className="pf-batch-status" role="status" aria-live="polite">
        <span className="pf-batch-count">
          {t('workbench.completedCount', { done: doneFiles.length, total: files.length })}
        </span>
        {failed > 0 && (
          <span className="pf-field-error">{t('progress.failed', { count: failed })}</span>
        )}
        {exportError && <span className="pf-field-error">{t('motion.errors.exportFailed')}</span>}
        {processing && (
          <TextButton onClick={onCancel}>{t('workbench.cancelProcessing')}</TextButton>
        )}
      </div>
      {doneFiles.length > 0 && (
        <p className="pf-batch-totals">
          <span>{formatFileSize(sourceBytes)}</span>
          <span aria-hidden>→</span>
          <strong>{formatFileSize(resultBytes)}</strong>
          <span className={cx('pf-file-ratio', saving < 0 && 'is-larger')}>
            {formatSizeChange(saving)}
          </span>
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="pf-export-button"
        icon={<FiDownload aria-hidden />}
        disabled={!doneFiles.length || isZipping}
        onClick={exportCompleted}
        aria-label={t('workbench.exportCompleted')}
      >
        <span className="pf-button-label">
          {t(isZipping ? 'actions.packing' : 'workbench.exportCompleted')}
        </span>
      </Button>
      {processing && (
        <div
          className="pf-batch-progress"
          role="progressbar"
          aria-label={t('workbench.batchProgress')}
          aria-valuemin={0}
          aria-valuemax={files.length}
          aria-valuenow={finished}
        >
          <span style={{ width: `${(finished / files.length) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
