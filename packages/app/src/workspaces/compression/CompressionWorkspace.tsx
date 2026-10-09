/** Image-compression workspace; shared navigation lives in App. */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle } from 'react-icons/fi';
import { ErrorBoundary } from '../../components/shell/ErrorBoundary';
import { PHONE_QUERY } from '../../components/ui/media';
import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import { useAutoCompress } from '../../hooks/useAutoCompress';
import { useFileStore } from '../../stores/fileStore';
import type { ImageFile } from '../../types';
import { getMissingBrowserFeatures } from '../../utils/browserSupport';
import { isSupportedImage } from '../../utils/fileUtils';
import { BatchSummary } from './BatchSummary';
import { FileQueue } from './FileQueue';
import { ImageDropSheet } from './ImageDropSheet';
import { CompressionInspector } from './inspector/CompressionInspector';
import { Preview } from './preview/Preview';

export default function CompressionWorkspace({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'preview'>(() =>
    window.matchMedia(PHONE_QUERY).matches ? 'list' : 'preview',
  );
  const [missingFeatures] = useState(() => getMissingBrowserFeatures());

  const { abortAll } = useAutoCompress(selectedId);

  const hasFiles = files.length > 0;

  // Select the first file once files arrive.
  useEffect(() => {
    if (files.length > 0 && !selectedId) {
      setSelectedId(files[0].id);
    }
  }, [files, selectedId]);

  // Move the selection when the selected file is removed.
  useEffect(() => {
    if (selectedId && !files.find((f) => f.id === selectedId)) {
      setSelectedId(files.length > 0 ? files[0].id : null);
    }
  }, [files, selectedId]);

  // Phones stay in the queue after adding files; selecting a row opens the preview.
  useEffect(() => {
    if (files.length === 0) {
      setMobileView(window.matchMedia(PHONE_QUERY).matches ? 'list' : 'preview');
    }
  }, [files.length]);

  // Paste images from the clipboard anywhere while this tool is active.
  useEffect(() => {
    if (!active || missingFeatures.length > 0) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && isSupportedImage(file)) pasted.push(file);
        }
      }
      if (pasted.length > 0) {
        e.preventDefault();
        addFiles(pasted);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [active, addFiles, missingFeatures.length]);

  const selectedFile = selectedId ? (files.find((f) => f.id === selectedId) ?? null) : null;
  const currentIdx = files.findIndex((f) => f.id === selectedId);

  const handleSelect = useCallback((file: ImageFile) => {
    setSelectedId(file.id);
    setMobileView('preview');
  }, []);

  const handleBackToList = useCallback(() => {
    setMobileView('list');
  }, []);

  const handlePrev = useCallback(() => {
    if (!selectedId) return;
    const idx = files.findIndex((f) => f.id === selectedId);
    if (idx > 0) setSelectedId(files[idx - 1].id);
  }, [selectedId, files]);

  const handleNext = useCallback(() => {
    if (!selectedId) return;
    const idx = files.findIndex((f) => f.id === selectedId);
    if (idx < files.length - 1) setSelectedId(files[idx + 1].id);
  }, [selectedId, files]);

  if (missingFeatures.length > 0) {
    return (
      <ErrorBoundary>
        <div className="pf-app" data-testid="app-root">
          <main className="pf-main" data-testid="app-main">
            <section className="pf-empty-state" data-testid="unsupported-browser">
              <div className="pf-error-card">
                <span className="pf-error-icon" aria-hidden="true">
                  <FiAlertTriangle />
                </span>
                <h1 className="pf-error-title">{t('compat.unsupportedTitle')}</h1>
                <p className="pf-error-copy">{t('compat.unsupportedBody')}</p>
                <p className="pf-error-message">
                  {t('compat.missingFeatures', { features: missingFeatures.join(', ') })}
                </p>
              </div>
            </section>
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="pf-app" data-testid="app-root">
        <WorkbenchLayout
          hasFiles={hasFiles}
          mobileView={mobileView}
          queue={<FileQueue selectedId={selectedId} onSelect={handleSelect} />}
          viewer={
            hasFiles ? (
              <Preview
                file={selectedFile}
                index={currentIdx}
                total={files.length}
                onPrev={handlePrev}
                onNext={handleNext}
                onBackToList={handleBackToList}
              />
            ) : (
              <ImageDropSheet />
            )
          }
          inspector={<CompressionInspector key={selectedFile?.id ?? 'empty'} file={selectedFile} />}
          batch={<BatchSummary onCancel={abortAll} />}
        />
      </div>
    </ErrorBoundary>
  );
}
