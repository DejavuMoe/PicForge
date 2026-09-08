import { useCallback, useRef, useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../stores/fileStore';
import { FileRow } from './FileRow';
import { ConfirmDialog } from './ConfirmDialog';
import type { ImageFile } from '../types';

export function FileList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (file: ImageFile) => void;
}) {
  const { t } = useTranslation();
  const files = useFileStore((s) => s.files);
  const clearAll = useFileStore((s) => s.clearAll);
  const removeFile = useFileStore((s) => s.removeFile);
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const handleRetry = useCallback((id: string) => useFileStore.getState().retryFile(id), []);
  return (
    <div className="pf-file-list" data-testid="file-list">
      <header className="pf-file-list-header">
        <h2>
          {t('workbench.files')} <span>{files.length || ''}</span>
        </h2>
        <button className="pf-text-button pf-add-files" onClick={() => input.current?.click()}>
          <FiPlus aria-hidden />
          {t('workbench.add')}
        </button>
        {files.length > 0 && (
          <button
            className="pf-icon-button"
            aria-label={t('actions.clearAll')}
            title={t('actions.clearAll')}
            onClick={(event) => {
              event.currentTarget.focus();
              setIsClearOpen(true);
            }}
          >
            <FiTrash2 aria-hidden />
          </button>
        )}
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept="image/*"
          data-testid="add-file-input"
          onChange={(event) => {
            const before = useFileStore.getState().files.length;
            if (event.target.files?.length) useFileStore.getState().addFiles(event.target.files);
            setUnsupported(
              !!event.target.files?.length && before === useFileStore.getState().files.length,
            );
            event.target.value = '';
          }}
        />
      </header>
      {unsupported && (
        <p className="pf-field-error" role="status">
          {t('toast.unsupported')}
        </p>
      )}
      {files.length ? (
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
      ) : (
        <div className="pf-queue-empty">{t('workbench.noFiles')}</div>
      )}
      {isClearOpen && (
        <ConfirmDialog
          danger
          title={t('dialog.clearTitle')}
          body={t('dialog.clearBody')}
          onCancel={() => setIsClearOpen(false)}
          onConfirm={() => {
            clearAll();
            setIsClearOpen(false);
          }}
        />
      )}
    </div>
  );
}
