/**
 * StatusBar — bottom bar with progress and download actions.
 *
 * Structure:
 *   Left:  progress bar + percentage
 *   Right: stats (compression ratio) + download buttons
 *
 * Download:
 *   - "Download" — downloads the currently selected image
 *   - "ZIP" — downloads all completed images as ZIP (when 2+ done)
 */

import { FiDownload, FiPackage } from 'react-icons/fi';
import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../stores/fileStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatFileSize, compressionRatio } from '../utils/fileUtils';
import type { ImageFile } from '../types';
import { createExportManifest, createZipName, getOutputName } from '../utils/exportManifest';

interface StatusBarProps {
  selectedFile: ImageFile | null;
}

export function StatusBar({ selectedFile }: StatusBarProps) {
  const { t } = useTranslation();
  const files = useFileStore((s) => s.files);
  const settings = useSettingsStore((s) => s.settings);
  const [isZipping, setIsZipping] = useState(false);
  const [wasmLoading, setWasmLoading] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      setWasmLoading((e as CustomEvent).detail.loading);
    };
    window.addEventListener('wasm-loading', handler);
    return () => window.removeEventListener('wasm-loading', handler);
  }, []);

  const doneFiles = files.filter((f) => f.status === 'done' && f.result);
  const selectedDone = selectedFile?.status === 'done' && selectedFile.result ? selectedFile : null;
  const canDownloadCurrent = !!selectedDone;
  const canDownloadZip = doneFiles.length >= 2;

  // Compute stats
  const stats = (() => {
    let totalOriginal = 0;
    let totalCompressed = 0;
    let processing = 0;
    let done = 0;
    let error = 0;
    for (const f of files) {
      totalOriginal += f.originalSize;
      if (f.result) totalCompressed += f.result.size;
      switch (f.status) {
        case 'processing':
          processing++;
          break;
        case 'done':
          done++;
          break;
        case 'error':
          error++;
          break;
      }
    }
    return { total: files.length, processing, done, error, totalOriginal, totalCompressed };
  })();

  const percent = stats.total > 0 ? Math.round(((stats.done + stats.error) / stats.total) * 100) : 0;
  const isComplete = stats.done + stats.error === stats.total && stats.total > 0;
  const isProcessing = stats.processing > 0;

  const ratio = stats.done > 0 && stats.totalOriginal > 0
    ? compressionRatio(stats.totalOriginal, stats.totalCompressed)
    : 0;
  const ratioClass = ratio > 0 ? 'is-positive' : ratio < 0 ? 'is-negative' : 'is-neutral';
  const progressClass = stats.error > 0 ? 'has-error' : isComplete ? 'is-complete' : 'is-active';

  const handleDownloadCurrent = useCallback(async () => {
    if (!selectedDone?.result) return;
    const { saveAs } = await import('file-saver');
    saveAs(selectedDone.result.blob, getOutputName(selectedDone, settings));
  }, [selectedDone, settings]);

  const handleDownloadZip = useCallback(async () => {
    if (doneFiles.length === 0) return;
    setIsZipping(true);
    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import('jszip'),
        import('file-saver'),
      ]);
      const zip = new JSZip();
      const date = new Date();
      const manifest = createExportManifest(doneFiles, settings, __APP_VERSION__, date);
      for (const fileEntry of manifest.files) {
        const file = doneFiles.find((item) => item.id === fileEntry.sourceId);
        if (!file?.result) continue;
        const outputName = fileEntry.outputName;
        zip.file(outputName, file.result.blob);
      }
      zip.file('picforge-manifest.json', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, createZipName(date));
    } catch (err) {
      console.error('Failed to create ZIP:', err);
    } finally {
      setIsZipping(false);
    }
  }, [doneFiles, settings]);

  if (stats.total === 0) return null;

  return (
    <footer
      className="pf-status-bar"
      role="status"
      aria-live="polite"
      data-testid="status-bar"
    >
      <div className="pf-status-progress-group">
        <div
          className={`pf-status-progress ${progressClass}${isProcessing ? ' is-processing' : ''}`}
          aria-label={`${stats.done + stats.error} / ${stats.total}`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          role="progressbar"
        >
          <span className="pf-status-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="pf-status-count">
          {stats.done + stats.error} / {stats.total}
        </span>
      </div>

      <div className="pf-status-meta">
        {isProcessing && (
          <span className="pf-status-text">
            {t('progress.processing', { count: stats.processing })}
          </span>
        )}
        {wasmLoading && (
          <span className="pf-status-text is-accent">
            {t('progress.loadingCodec')}
          </span>
        )}
        {stats.error > 0 && (
          <span className="pf-status-text is-error">
            {t('progress.failed', { count: stats.error })}
          </span>
        )}
        {stats.done > 0 && (
          <span className={`pf-status-ratio ${ratioClass}`}>
            {ratio > 0 ? `-${ratio}%` : ratio < 0 ? `+${Math.abs(ratio)}%` : t('progress.noChange')}
          </span>
        )}
        {stats.done > 0 && (
          <span className="pf-status-size-summary">
            <span className="pf-status-size-muted">
              {formatFileSize(stats.totalOriginal)}
            </span>
            <span className="pf-status-arrow">→</span>
            <span className="pf-status-size-strong">
              {formatFileSize(stats.totalCompressed)}
            </span>
          </span>
        )}

        {(canDownloadCurrent || canDownloadZip) && (
          <span className="pf-status-divider" aria-hidden="true" />
        )}

        {canDownloadCurrent && (
          <button
            className="pf-status-button pf-status-button-primary"
            type="button"
            title={t('tooltips.downloadCurrent')}
            aria-label={t('tooltips.downloadCurrent')}
            onClick={handleDownloadCurrent}
          >
            <FiDownload className="pf-status-button-icon" aria-hidden="true" />
            <span>{t('actions.download')}</span>
          </button>
        )}
        {canDownloadZip && (
          <button
            className="pf-status-button pf-status-button-secondary"
            type="button"
            title={t('tooltips.downloadZip')}
            aria-label={t('tooltips.downloadZip')}
            disabled={isZipping}
            onClick={handleDownloadZip}
          >
            <FiPackage className="pf-status-button-icon" aria-hidden="true" />
            <span>{isZipping ? t('actions.packing') : t('actions.downloadZip', { count: doneFiles.length })}</span>
          </button>
        )}
      </div>
    </footer>
  );
}
