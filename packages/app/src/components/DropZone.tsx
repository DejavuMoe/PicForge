import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCommand, FiUploadCloud } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../stores/fileStore';
import { extractFiles } from '../utils/fileUtils';

const FORMAT_CHIPS = ['JPEG', 'PNG', 'WebP', 'AVIF'];

export function DropZone() {
  const { t } = useTranslation();
  const addFiles = useFileStore((state) => state.addFiles);
  const [isDragging, setIsDragging] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showUnsupportedToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToastMessage(t('toast.unsupported'));
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, [t]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      if (event.dataTransfer.files.length === 0) return;

      const totalCount = event.dataTransfer.files.length;
      const files = await extractFiles(event.dataTransfer.files);
      if (files.length > 0) {
        addFiles(files);
      } else if (totalCount > 0) {
        showUnsupportedToast();
      }
    },
    [addFiles, showUnsupportedToast],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) return;

      const totalCount = event.target.files.length;
      const beforeCount = useFileStore.getState().files.length;
      addFiles(event.target.files);
      const addedCount = useFileStore.getState().files.length - beforeCount;
      if (addedCount === 0 && totalCount > 0) {
        showUnsupportedToast();
      }
      event.target.value = '';
    },
    [addFiles, showUnsupportedToast],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <div
      className={`pf-drop-zone${isDragging ? ' is-dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={t('dropzone.dragDefault')}
      data-testid="drop-zone"
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
    >
      <div className="pf-drop-content">
        <div className="pf-drop-icon-badge">
          <FiUploadCloud size={24} aria-hidden="true" />
        </div>

        <div>
          <p className="pf-drop-main-text">
            {isDragging ? t('dropzone.dragActive') : t('dropzone.dragDefault')}
          </p>
          <p className="pf-drop-secondary-text">{t('dropzone.clickHint')}</p>
          <div className="pf-drop-paste">
            <FiCommand size={12} aria-hidden="true" />
            <span>{t('dropzone.pasteHint')}</span>
          </div>
        </div>

        <div className="pf-format-list" aria-hidden="true">
          {FORMAT_CHIPS.map((format, index) => (
            <span key={format}>
              {format}
              {index < FORMAT_CHIPS.length - 1 && (
                <span className="pf-format-separator">.</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {toastMessage && (
        <div className="pf-drop-toast" role="status">
          {toastMessage}
        </div>
      )}

      <input
        ref={inputRef}
        className="pf-file-input"
        type="file"
        accept="image/*"
        multiple
        aria-label={t('dropzone.dragDefault')}
        data-testid="file-input"
        onChange={handleFileChange}
      />
    </div>
  );
}
