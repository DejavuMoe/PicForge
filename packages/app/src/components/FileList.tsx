/**
 * FileList — native scrollable file list with header and clear-all dialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FiTrash2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../stores/fileStore';
import { FileRow } from './FileRow';
import type { ImageFile } from '../types';

interface FileListProps {
  selectedId: string | null;
  onSelect: (file: ImageFile) => void;
}

export function FileList({ selectedId, onSelect }: FileListProps) {
  const { t } = useTranslation();
  const files = useFileStore((s) => s.files);
  const clearAll = useFileStore((s) => s.clearAll);
  const removeFile = useFileStore((s) => s.removeFile);
  const [isClearOpen, setIsClearOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isClearOpen) return;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsClearOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isClearOpen]);

  const handleClearConfirm = useCallback(() => {
    clearAll();
    setIsClearOpen(false);
  }, [clearAll]);

  const handleRetry = useCallback((id: string) => {
    useFileStore.getState().updateFile(id, { status: 'pending', progress: 0, error: undefined });
  }, []);

  if (files.length === 0) return null;

  return (
    <div className="pf-file-list" data-testid="file-list">
      <header className="pf-file-list-header">
        <span className="pf-file-list-title">
          {t('fileQueue.title', { count: files.length })}
        </span>
        <button
          type="button"
          className="pf-file-list-clear"
          title={t('actions.clearAll')}
          aria-label={t('actions.clearAll')}
          onClick={() => setIsClearOpen(true)}
        >
          <FiTrash2 className="pf-row-icon" aria-hidden="true" />
        </button>
      </header>

      <div className="pf-file-list-scroll">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            isSelected={file.id === selectedId}
            onSelect={onSelect}
            onRemove={removeFile}
            onRetry={handleRetry}
          />
        ))}
      </div>

      {isClearOpen && (
        <div
          className="pf-dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsClearOpen(false);
          }}
        >
          <div
            className="pf-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pf-clear-title"
            aria-describedby="pf-clear-body"
          >
            <h2 className="pf-dialog-title" id="pf-clear-title">
              {t('dialog.clearTitle')}
            </h2>
            <p className="pf-dialog-copy" id="pf-clear-body">
              {t('dialog.clearBody')}
            </p>
            <div className="pf-dialog-actions">
              <button
                ref={cancelRef}
                type="button"
                className="pf-dialog-button pf-dialog-button-ghost"
                onClick={() => setIsClearOpen(false)}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="pf-dialog-button pf-dialog-button-danger"
                onClick={handleClearConfirm}
              >
                {t('actions.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
