/** A file selection button and independent actions: no nested interactive roles. */
import { memo, type CSSProperties } from 'react';
import { FiDownload, FiRefreshCw, FiSquare, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { cx } from '../../components/ui/cx';
import { IconButton } from '../../components/ui/IconButton';
import { StatusGlyph } from '../../components/ui/StatusGlyph';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ImageFile } from '../../types';
import { getOutputName, isResultExportable } from '../../utils/exportManifest';
import { compressionRatio, formatFileSize, formatSizeChange } from '../../utils/fileUtils';

interface FileRowProps {
  file: ImageFile;
  isSelected: boolean;
  onSelect: (file: ImageFile) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export const FileRow = memo(function FileRow({
  file,
  isSelected,
  onSelect,
  onRemove,
  onRetry,
}: FileRowProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const canExport = isResultExportable(file, settings);
  const result = canExport ? file.result : undefined;
  const saving = result ? compressionRatio(file.originalSize, result.size) : 0;
  // Remaining size as a share of the original; the unfilled rule is what was saved.
  const remaining = result ? result.size / Math.max(1, file.originalSize) : 0;
  const download = async () => {
    if (!isResultExportable(file, useSettingsStore.getState().settings)) return;
    const { saveAs } = await import('file-saver');
    saveAs(file.result!.blob, getOutputName(file, settings));
  };
  return (
    <div className={cx('pf-file-row', isSelected && 'is-selected')} data-testid="file-row">
      {isSelected && <span className="pf-file-row-selected-bar" aria-hidden />}
      <button
        type="button"
        className="pf-file-select"
        aria-label={file.file.name}
        aria-describedby={`file-status-${file.id}`}
        aria-pressed={isSelected}
        onClick={() => onSelect(file)}
      >
        <span className="pf-file-thumb-frame">
          <img
            className="pf-file-thumb"
            src={file.previewUrl}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        </span>
        <span className="pf-file-row-main">
          <span className="pf-file-name-line">
            <span className="pf-file-name" data-tooltip={file.file.name}>
              {file.file.name}
            </span>
            {file.settingsMode === 'custom' && (
              <span className="pf-file-custom-label">{t('settings.mode.custom')}</span>
            )}
          </span>
          <span className="pf-file-status-line">
            <StatusGlyph status={file.status} progress={file.progress} />
            <span
              id={`file-status-${file.id}`}
              className={cx('pf-file-status-text', `is-${file.status}`, result && 'pf-sr-only')}
            >
              {t(`status.${file.status}`, { progress: file.progress })}
            </span>
            <span className="pf-file-meta">
              {!result && <span aria-hidden>·</span>}
              <span>{formatFileSize(file.originalSize)}</span>
              {result && (
                <>
                  <span aria-hidden>→</span>
                  <span className="pf-file-result-size">{formatFileSize(result.size)}</span>
                </>
              )}
            </span>
            {result && (
              <span className={cx('pf-file-ratio', saving < 0 && 'is-larger')}>
                {formatSizeChange(saving)}
              </span>
            )}
          </span>
          {file.status === 'processing' ? (
            <span className="pf-file-row-progress" aria-hidden>
              <span style={{ width: `${file.progress}%` }} />
            </span>
          ) : (
            result && (
              <span
                className={cx('pf-file-delta', remaining > 1 && 'is-larger')}
                style={{ '--pf-delta': Math.min(1, remaining) } as CSSProperties}
                aria-hidden
              />
            )
          )}
        </span>
      </button>
      <div className="pf-file-row-actions">
        {file.status === 'processing' && (
          <IconButton
            size="sm"
            className="pf-row-action"
            label={t('tooltips.cancelImage')}
            icon={<FiSquare aria-hidden />}
            onClick={() => useFileStore.getState().cancelFile(file.id)}
          />
        )}
        {(file.status === 'error' || file.status === 'cancelled') && (
          <IconButton
            size="sm"
            className="pf-row-action"
            label={t('tooltips.retryImage')}
            icon={<FiRefreshCw aria-hidden />}
            onClick={() => onRetry(file.id)}
          />
        )}
        {canExport && (
          <IconButton
            size="sm"
            className="pf-row-action"
            label={t('actions.download')}
            icon={<FiDownload aria-hidden />}
            onClick={download}
          />
        )}
        <IconButton
          size="sm"
          className="pf-row-action"
          label={t('tooltips.removeImage')}
          icon={<FiX aria-hidden />}
          onClick={() => onRemove(file.id)}
        />
      </div>
    </div>
  );
});
