/** A file selection button and independent actions: no nested interactive roles. */
import { memo, type CSSProperties, type ReactNode } from 'react';
import { FiDownload, FiRefreshCw, FiStopCircle, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileStore } from '../stores/fileStore';
import type { ImageFile } from '../types';
import { compressionRatio, formatFileSize, formatSizeChange } from '../utils/fileUtils';
import { getOutputName, isResultExportable } from '../utils/exportManifest';

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
    <div className={`pf-file-row${isSelected ? ' is-selected' : ''}`} data-testid="file-row">
      {isSelected && <span className="pf-file-row-selected-bar" aria-hidden />}
      <button
        className="pf-file-select"
        aria-label={file.file.name}
        aria-describedby={`file-status-${file.id}`}
        aria-pressed={isSelected}
        onClick={() => onSelect(file)}
      >
        <span className="pf-file-thumb-skeleton">
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
          <span className="pf-file-name" data-tooltip={file.file.name}>
            {file.file.name}
          </span>
          <span className="pf-file-status-line">
            <span id={`file-status-${file.id}`} className={`pf-file-status-text is-${file.status}`}>
              {t(`status.${file.status}`, { progress: file.progress })}
            </span>
            {file.settingsMode === 'custom' && (
              <span className="pf-file-custom-label">{t('settings.mode.custom')}</span>
            )}
          </span>
          <span className="pf-file-meta">
            <span>{formatFileSize(file.originalSize)}</span>
            {result && (
              <>
                <span aria-hidden>→</span>
                <span className="pf-file-result-size">{formatFileSize(result.size)}</span>
                <span className={`pf-file-ratio${saving < 0 ? ' is-larger' : ''}`}>
                  {formatSizeChange(saving)}
                </span>
              </>
            )}
          </span>
          {file.status === 'processing' ? (
            <span className="pf-file-row-progress" aria-hidden>
              <span style={{ width: `${file.progress}%` }} />
            </span>
          ) : (
            result && (
              <span
                className={`pf-file-delta${remaining > 1 ? ' is-larger' : ''}`}
                style={{ '--pf-delta': Math.min(1, remaining) } as CSSProperties}
                aria-hidden
              />
            )
          )}
        </span>
      </button>
      <div className="pf-file-row-actions">
        {file.status === 'processing' && (
          <RowAction
            label={t('tooltips.cancelImage')}
            onClick={() => useFileStore.getState().cancelFile(file.id)}
          >
            <FiStopCircle aria-hidden />
          </RowAction>
        )}
        {(file.status === 'error' || file.status === 'cancelled') && (
          <RowAction label={t('tooltips.retryImage')} onClick={() => onRetry(file.id)}>
            <FiRefreshCw aria-hidden />
          </RowAction>
        )}
        {canExport && (
          <RowAction label={t('actions.download')} onClick={download}>
            <FiDownload aria-hidden />
          </RowAction>
        )}
        <RowAction label={t('tooltips.removeImage')} onClick={() => onRemove(file.id)}>
          <FiX aria-hidden />
        </RowAction>
      </div>
    </div>
  );
});
function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="pf-row-action"
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
