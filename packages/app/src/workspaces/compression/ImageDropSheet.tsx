import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DropSheet } from '../../components/workbench/DropSheet';
import { useFileStore } from '../../stores/fileStore';
import { collectDroppedFiles, isSupportedImage } from '../../utils/fileUtils';

export function ImageDropSheet() {
  const { t } = useTranslation();
  const addFiles = useFileStore((state) => state.addFiles);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showUnsupportedToast = useCallback(() => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToastMessage(t('toast.unsupported'));
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, [t]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    },
    [],
  );

  const handleDrop = useCallback(
    async (data: DataTransfer) => {
      if (data.items.length === 0 && data.files.length === 0) return;
      // Read entries synchronously; the DataTransfer is emptied after this event.
      const dropped = await collectDroppedFiles(data);
      const files = dropped.filter(isSupportedImage);
      if (files.length > 0) addFiles(files);
      else if (dropped.length > 0) showUnsupportedToast();
    },
    [addFiles, showUnsupportedToast],
  );

  return (
    <DropSheet
      testId="drop-zone"
      index="01"
      tool={t('motion.compression')}
      title={t('workbench.emptyTitle')}
      activeTitle={t('dropzone.dragActive')}
      hint={t('workbench.dropHint')}
      formats={t('workbench.formatHint').split(' · ')}
      label={t('dropzone.dragDefault')}
      onDrop={(data) => void handleDrop(data)}
      onBrowse={() => inputRef.current?.click()}
    >
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
        tabIndex={-1}
        aria-label={t('dropzone.dragDefault')}
        data-testid="file-input"
        onChange={(event) => {
          if (!event.target.files || event.target.files.length === 0) return;
          const totalCount = event.target.files.length;
          const beforeCount = useFileStore.getState().files.length;
          addFiles(event.target.files);
          const addedCount = useFileStore.getState().files.length - beforeCount;
          if (addedCount === 0 && totalCount > 0) showUnsupportedToast();
          event.target.value = '';
        }}
      />
    </DropSheet>
  );
}
