/**
 * FileRow — native row for one queued file.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { FiDownload, FiRefreshCw, FiSliders, FiStopCircle, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileStore } from '../stores/fileStore';
import { getPool } from '../hooks/useAutoCompress';
import type { ImageFile } from '../types';
import { formatFileSize, compressionRatio } from '../utils/fileUtils';
import { cloneSettings } from '../utils/settingsUtils';
import { getOutputName } from '../utils/exportManifest';

interface FileRowProps {
  file: ImageFile;
  isSelected: boolean;
  onSelect: (file: ImageFile) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

const CONTEXT_MENU_WIDTH = 168;
const CONTEXT_MENU_GUTTER = 8;

export const FileRow = memo(function FileRow({
  file,
  isSelected,
  onSelect,
  onRemove,
  onRetry,
}: FileRowProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const setFileCustomSettings = useFileStore((s) => s.setFileCustomSettings);
  const resetFileToGlobal = useFileStore((s) => s.resetFileToGlobal);
  const [contextMenu, setContextMenu] = useState<MenuPosition | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const handleSelect = useCallback(() => onSelect(file), [file, onSelect]);

  const handleRemove = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    onRemove(file.id);
    closeContextMenu();
  }, [closeContextMenu, file.id, onRemove]);

  const handleRetry = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    onRetry(file.id);
    closeContextMenu();
  }, [closeContextMenu, file.id, onRetry]);

  const handleDownload = useCallback(async (event?: ReactMouseEvent) => {
    event?.stopPropagation();
    if (!file.result) return;
    const { saveAs } = await import('file-saver');
    saveAs(file.result.blob, getOutputName(file, settings));
    closeContextMenu();
  }, [closeContextMenu, file, settings]);

  const handleCustomize = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    setFileCustomSettings(file.id, cloneSettings(settings));
    closeContextMenu();
  }, [closeContextMenu, file.id, settings, setFileCustomSettings]);

  const handleUseGlobal = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    resetFileToGlobal(file.id, settings);
    closeContextMenu();
  }, [closeContextMenu, file.id, resetFileToGlobal, settings]);

  const handleCancel = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    getPool().abortTask(file.id);
    useFileStore.getState().updateFile(file.id, { status: 'pending', progress: 0 });
  }, [file.id]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(file);
    }
  }, [file, onSelect]);

  const handleContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(
        event.clientX,
        window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GUTTER,
      ),
      y: event.clientY,
    });
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const nextY = Math.min(contextMenu.y, window.innerHeight - rect.height - CONTEXT_MENU_GUTTER);
    const nextX = Math.min(contextMenu.x, window.innerWidth - rect.width - CONTEXT_MENU_GUTTER);
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu({
        x: Math.max(CONTEXT_MENU_GUTTER, nextX),
        y: Math.max(CONTEXT_MENU_GUTTER, nextY),
      });
    }
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKeyDownWindow = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDownWindow);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDownWindow);
    };
  }, [closeContextMenu, contextMenu]);

  const ratio = file.result ? compressionRatio(file.originalSize, file.result.size) : 0;
  const statusClass = file.status === 'processing'
    ? 'is-processing'
    : file.status === 'done'
      ? 'is-done'
      : file.status === 'error'
        ? 'is-error'
        : '';

  return (
    <div
      className={`pf-file-row${isSelected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={file.file.name}
      aria-pressed={isSelected}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      data-testid="file-row"
    >
      {isSelected && <span className="pf-file-row-selected-bar" aria-hidden="true" />}

      <div className="pf-file-thumb-wrap">
        <div className={`pf-file-thumb-skeleton${imgLoaded ? ' is-loaded' : ''}`}>
          <img
            className="pf-file-thumb"
            src={file.previewUrl}
            alt={file.file.name}
            draggable={false}
            decoding="async"
            onLoad={() => setImgLoaded(true)}
          />
        </div>
        {statusClass && <span className={`pf-file-status-dot ${statusClass}`} aria-hidden="true" />}
      </div>

      <div className="pf-file-row-main">
        <div className="pf-file-name" title={file.file.name}>
          {file.file.name}
        </div>
        <div className="pf-file-meta">
          {file.settingsMode === 'custom' && (
            <span className="pf-file-custom-label">{t('settings.mode.custom')}</span>
          )}
          <span className="pf-file-size-muted">{formatFileSize(file.originalSize)}</span>
          {file.result && (
            <>
              <span className="pf-file-arrow">→</span>
              <span className={`pf-file-result-size ${ratio > 0 ? 'is-positive' : 'is-negative'}`}>
                {formatFileSize(file.result.size)}
              </span>
              <span className={`pf-file-ratio ${ratio > 0 ? 'is-positive' : 'is-negative'}`}>
                {ratio > 0 ? `-${ratio}%` : `+${Math.abs(ratio)}%`}
              </span>
            </>
          )}
          {file.status === 'processing' && (
            <span className="pf-file-progress-text">{file.progress}%</span>
          )}
          {file.status === 'error' && (
            <span className="pf-file-error-text">{t('status.error')}</span>
          )}
        </div>
      </div>

      {file.status === 'processing' && (
        <span className="pf-file-row-progress" aria-hidden="true">
          <span style={{ width: `${file.progress}%` }} />
        </span>
      )}

      <div className="pf-file-row-actions">
        {file.status === 'processing' && (
          <RowAction
            label={t('tooltips.cancelImage')}
            tone="warning"
            onClick={handleCancel}
            icon={<FiStopCircle aria-hidden="true" />}
          />
        )}
        {file.status === 'error' && (
          <RowAction
            label={t('tooltips.retryImage')}
            tone="accent"
            onClick={handleRetry}
            icon={<FiRefreshCw aria-hidden="true" />}
          />
        )}
        {file.status === 'done' && file.result && (
          <RowAction
            label={t('actions.download')}
            tone="accent"
            onClick={handleDownload}
            icon={<FiDownload aria-hidden="true" />}
          />
        )}
        <RowAction
          label={t('tooltips.removeImage')}
          tone="danger"
          onClick={handleRemove}
          icon={<FiX aria-hidden="true" />}
        />
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="pf-file-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {file.status === 'done' && file.result && (
            <ContextMenuItem
              label={t('actions.download')}
              onClick={handleDownload}
              icon={<FiDownload aria-hidden="true" />}
            />
          )}
          {file.status === 'error' && (
            <ContextMenuItem
              label={t('tooltips.retryImage')}
              onClick={handleRetry}
              icon={<FiRefreshCw aria-hidden="true" />}
            />
          )}
          {file.settingsMode === 'custom' ? (
            <ContextMenuItem
              label={t('actions.useGlobalSettings')}
              onClick={handleUseGlobal}
              icon={<FiSliders aria-hidden="true" />}
            />
          ) : (
            <ContextMenuItem
              label={t('actions.customizeImage')}
              onClick={handleCustomize}
              icon={<FiSliders aria-hidden="true" />}
            />
          )}
          {(file.status === 'done' || file.status === 'error') && (
            <span className="pf-file-context-divider" aria-hidden="true" />
          )}
          <ContextMenuItem
            label={t('tooltips.removeImage')}
            onClick={handleRemove}
            tone="danger"
            icon={<FiX aria-hidden="true" />}
          />
        </div>
      )}
    </div>
  );
});

function RowAction({
  label,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone?: 'default' | 'accent' | 'danger' | 'warning';
  onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`pf-row-action is-${tone}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function ContextMenuItem({
  label,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone?: 'default' | 'danger';
  onClick: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`pf-file-context-item is-${tone}`}
      role="menuitem"
      onClick={onClick}
    >
      <span className="pf-file-context-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
