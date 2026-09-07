/** Original image-compression workspace; shared navigation lives in App. */

import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle } from 'react-icons/fi';
import { DropZone } from './components/DropZone';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StatusBar } from './components/StatusBar';
import { ToolHeading } from './components/ToolHeading';
import { Toolbar } from './components/Toolbar';
import { Workspace } from './components/Workspace';
import { useAutoCompress } from './hooks/useAutoCompress';
import { useFileStore } from './stores/fileStore';
import { getMissingBrowserFeatures } from './utils/browserSupport';
import { isSupportedImage } from './utils/fileUtils';
import type { ImageFile } from './types';

export default function CompressionWorkspace({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const files = useFileStore((s) => s.files);
  const addFiles = useFileStore((s) => s.addFiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'preview'>('list');
  const [missingFeatures] = useState(() => getMissingBrowserFeatures());

  useAutoCompress();

  const hasFiles = files.length > 0;

  // Auto-select first file when files are added
  useEffect(() => {
    if (files.length > 0 && !selectedId) {
      setSelectedId(files[0].id);
    }
  }, [files, selectedId]);

  // Clean up selectedId when the selected file is removed
  useEffect(() => {
    if (selectedId && !files.find((f) => f.id === selectedId)) {
      setSelectedId(files.length > 0 ? files[0].id : null);
    }
  }, [files, selectedId]);

  // Keep mobile users in the queue after adding files; they can enter preview
  // explicitly by selecting a row.
  useEffect(() => {
    if (files.length === 0) {
      setMobileView('list');
    }
  }, [files.length]);

  // Global paste support — paste images from clipboard anywhere
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

  const currentIdx = files.findIndex((f) => f.id === selectedId);

  if (missingFeatures.length > 0) {
    return (
      <ErrorBoundary>
        <div className="pf-app" data-testid="app-root">
          <main className="pf-main" data-testid="app-main">
            <section className="pf-empty-state" data-testid="unsupported-browser">
              <div className="pf-error-card">
                <div className="pf-error-icon" aria-hidden="true">
                  <FiAlertTriangle className="pf-icon" />
                </div>
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
        <ToolHeading tool="compression" />
        {hasFiles ? (
          <>
            <Toolbar />
            <Workspace
              selectedId={selectedId}
              selectedFile={selectedFile}
              mobileView={mobileView}
              currentIdx={currentIdx}
              fileCount={files.length}
              onSelect={handleSelect}
              onBackToList={handleBackToList}
              onPrev={handlePrev}
              onNext={handleNext}
            />
          </>
        ) : (
          <main className="pf-main" data-testid="app-main">
            <section className="pf-empty-state" data-testid="empty-state">
              <div className="pf-empty-state-inner">
                <DropZone />
              </div>
            </section>
          </main>
        )}

        {hasFiles && <StatusBar selectedFile={selectedFile} />}
      </div>
    </ErrorBoundary>
  );
}
