import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { QueuePanel } from '../../components/workbench/QueuePanel';
import { useFileStore } from '../../stores/fileStore';
import type { ImageFile } from '../../types';
import { FileRow } from './FileRow';

export function FileQueue({
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
    <>
      <QueuePanel
        testId="file-list"
        title={t('workbench.files')}
        count={files.length}
        onAdd={() => input.current?.click()}
        clearLabel={t('actions.clearAll')}
        onClear={() => setIsClearOpen(true)}
        notice={
          unsupported && (
            <p className="pf-queue-notice pf-field-error" role="status">
              {t('toast.unsupported')}
            </p>
          )
        }
      >
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
      </QueuePanel>
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
    </>
  );
}
