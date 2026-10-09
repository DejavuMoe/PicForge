/**
 * Compression stage: the selected image judged against its result.
 *
 * Same-size outputs default to a split slider for quick quality checks. Resized desktop
 * outputs default to two-up; phones keep a full-size slider. Both comparison layouts
 * share zoom and pan.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { PHONE_QUERY, toggleFullscreen, useMediaQuery } from '../../../components/ui/media';
import { StatusGlyph } from '../../../components/ui/StatusGlyph';
import { StageHeader } from '../../../components/workbench/StageHeader';
import { useFileStore } from '../../../stores/fileStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { FORMAT_OPTIONS, type ImageFile } from '../../../types';
import { isResultExportable } from '../../../utils/exportManifest';
import { compressionRatio, formatFileSize } from '../../../utils/fileUtils';
import { PREVIEW_TEST_IDS } from '../../../utils/previewLayers';
import {
  getDefaultCompareMode,
  isCompareModeAvailable,
  type CompareMode,
} from '../../../utils/previewUtils';
import { getEffectiveSettings } from '../../../utils/settingsUtils';
import {
  SideBySideCompareView,
  SingleImageView,
  SliderCompareView,
  type ImageMeta,
} from './CompareViews';
import { usePreviewViewport } from './usePreviewViewport';
import { ViewBar, type StageView } from './ViewBar';

export function Preview({
  file,
  index,
  total,
  onPrev,
  onNext,
  onBackToList,
}: {
  file: ImageFile | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBackToList: () => void;
}) {
  const { t } = useTranslation();
  const globalSettings = useSettingsStore((s) => s.settings);
  const isMobile = useMediaQuery(PHONE_QUERY);
  const previewRef = useRef<HTMLDivElement>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('single');
  const [view, setView] = useState<StageView>('compare');
  const {
    containerRef,
    viewport,
    sliderPos,
    setSliderPos,
    isInteracting,
    setZoomLevel,
    resetViewport,
    handleInspectPointerDown,
    handleSliderComparePointerDown,
  } = usePreviewViewport({
    fileId: file?.id,
    outputWidth: file?.outputMeta?.outputWidth,
    outputHeight: file?.outputMeta?.outputHeight,
  });

  const hasPrev = index > 0;
  const hasNext = index < total - 1;
  const ratio = file?.result ? compressionRatio(file.originalSize, file.result.size) : 0;
  const hasResult = !!file && isResultExportable(file, globalSettings);
  const hasDimensionChange =
    !!file?.outputMeta &&
    (file.outputMeta.originalWidth !== file.outputMeta.outputWidth ||
      file.outputMeta.originalHeight !== file.outputMeta.outputHeight);
  const defaultCompareMode = getDefaultCompareMode({ hasResult, hasDimensionChange, isMobile });
  const activeCompareMode = isCompareModeAvailable(compareMode, hasResult)
    ? compareMode
    : defaultCompareMode;

  const previewViewportStyle = useMemo(
    () =>
      ({
        '--preview-pan-x': `${viewport.panX}px`,
        '--preview-pan-y': `${viewport.panY}px`,
        '--preview-zoom': `${viewport.zoom}`,
      }) as CSSProperties,
    [viewport],
  );

  const originalMeta = useMemo<ImageMeta | null>(() => {
    if (!file) return null;
    return {
      label: t('preview.original'),
      src: file.previewUrl,
      size: formatFileSize(file.originalSize),
      dimensions: file.outputMeta
        ? `${file.outputMeta.originalWidth}×${file.outputMeta.originalHeight}`
        : undefined,
    };
  }, [file, t]);

  const outputMeta = useMemo<ImageMeta | null>(() => {
    if (!file?.result || !hasResult) return null;
    return {
      label: t('preview.compressed'),
      src: file.result.previewUrl,
      size: formatFileSize(file.result.size),
      dimensions: file.outputMeta
        ? `${file.outputMeta.outputWidth}×${file.outputMeta.outputHeight}`
        : undefined,
      ratio,
    };
  }, [file, hasResult, ratio, t]);

  useEffect(() => {
    setCompareMode(defaultCompareMode);
  }, [file?.id, defaultCompareMode]);

  useEffect(() => {
    if (!file) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || containerRef.current?.closest('[hidden]')) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, button, select, [role=combobox], [role=slider], [contenteditable]',
        )
      )
        return;
      if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, file, hasPrev, hasNext, onPrev, onNext]);

  if (!file || !originalMeta) {
    return (
      <div className="pf-preview-empty">
        <span>{t('preview.selectHint')}</span>
      </div>
    );
  }

  const shownView = hasResult ? view : 'original';
  const working = file.status === 'processing' || file.status === 'pending';
  const outputFormat = FORMAT_OPTIONS.find(
    (option) => option.value === getEffectiveSettings(file, globalSettings).outputFormat,
  )?.label;
  const status =
    working && !hasResult ? (
      <span className="pf-stage-status">
        <StatusGlyph status={file.status} progress={file.progress} />
        {file.status === 'processing' ? (
          <>
            {t('preview.compressing')}
            <span className="pf-mono">{file.progress}%</span>
          </>
        ) : (
          t('status.pending')
        )}
      </span>
    ) : undefined;

  return (
    <div
      ref={previewRef}
      className={cx(
        'pf-preview',
        shownView === 'compare' && activeCompareMode === 'sideBySide' && 'is-two-up',
      )}
    >
      <StageHeader
        title={file.file.name}
        facts={
          <>
            <span>
              {originalMeta.dimensions}
              {hasResult && outputMeta?.dimensions !== originalMeta.dimensions && (
                <> → {outputMeta?.dimensions}</>
              )}
            </span>
            <span>
              {originalMeta.size}
              {hasResult && outputMeta && <> → {outputMeta.size}</>}
            </span>
            {hasResult && <span>{outputFormat}</span>}
          </>
        }
        progress={file.status === 'processing' ? file.progress : undefined}
        index={index}
        total={total}
        onBack={onBackToList}
        onPrev={onPrev}
        onNext={onNext}
      />
      {!hasResult && file.result && working && (
        <p className="pf-preview-notice" role="status">
          {t('workbench.updating')}
        </p>
      )}
      {(file.status === 'error' || file.status === 'cancelled') && (
        <div className={cx('pf-preview-feedback', file.status === 'error' && 'is-error')}>
          <p role={file.status === 'error' ? 'alert' : 'status'}>
            {file.status === 'error' && file.error?.startsWith('Animation: ')
              ? t(`animationErrors.${file.error.slice(11)}`, {
                  defaultValue: t('workbench.processingFailed'),
                })
              : t(file.status === 'error' ? 'workbench.processingFailed' : 'status.cancelled')}
          </p>
          <TextButton onClick={() => useFileStore.getState().retryFile(file.id)}>
            {t('tooltips.retryImage')}
          </TextButton>
          {file.status === 'error' && file.error && !file.error.startsWith('Animation: ') && (
            <details>
              <summary>{t('workbench.errorDetails')}</summary>
              <p>{file.error}</p>
            </details>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        data-testid={PREVIEW_TEST_IDS.viewport}
        className="pf-preview-viewport"
        data-zoomed={viewport.zoom > 1}
        style={
          {
            ...previewViewportStyle,
            '--pf-source-width': `${(hasResult && view === 'result' ? file.outputMeta?.outputWidth : file.outputMeta?.originalWidth) ?? 100000}px`,
            '--pf-source-aspect': file.outputMeta
              ? hasResult && view === 'result'
                ? file.outputMeta.outputWidth / Math.max(1, file.outputMeta.outputHeight)
                : file.outputMeta.originalWidth / Math.max(1, file.outputMeta.originalHeight)
              : 1.5,
            '--pf-result-width': `${file.outputMeta?.outputWidth ?? file.outputMeta?.originalWidth ?? 100000}px`,
            '--pf-result-aspect': file.outputMeta
              ? file.outputMeta.outputWidth / Math.max(1, file.outputMeta.outputHeight)
              : 1.5,
            // Phones size the stage to the source, so switching views never moves the page.
            '--pf-stage-aspect': file.outputMeta
              ? file.outputMeta.originalWidth / Math.max(1, file.outputMeta.originalHeight)
              : 1.5,
            cursor: getPreviewCursor(activeCompareMode, viewport.zoom, hasResult),
            touchAction: viewport.zoom > 1 ? 'none' : 'pan-y',
          } as CSSProperties
        }
      >
        {view === 'compare' && activeCompareMode === 'sideBySide' && outputMeta ? (
          <SideBySideCompareView
            original={originalMeta}
            output={outputMeta}
            isPanning={isInteracting}
            onPointerDown={handleInspectPointerDown}
          />
        ) : view === 'compare' && outputMeta ? (
          <SliderCompareView
            original={originalMeta}
            output={outputMeta}
            sliderPos={sliderPos}
            onSliderChange={setSliderPos}
            isPanning={isInteracting}
            onPointerDown={handleSliderComparePointerDown}
          />
        ) : (
          <SingleImageView
            image={view === 'original' ? originalMeta : (outputMeta ?? originalMeta)}
            status={status}
            isPanning={isInteracting}
            onPointerDown={handleInspectPointerDown}
          />
        )}
      </div>
      <ViewBar
        view={shownView}
        mode={activeCompareMode}
        hasResult={hasResult}
        zoom={viewport.zoom}
        showFullscreen={!isMobile}
        onView={setView}
        onCompare={(mode) => {
          setView('compare');
          setCompareMode(mode);
        }}
        onSetZoom={setZoomLevel}
        onResetZoom={resetViewport}
        onFullscreen={() => toggleFullscreen(previewRef.current)}
      />
    </div>
  );
}

function getPreviewCursor(mode: CompareMode, zoom: number, hasResult: boolean): string {
  if (!hasResult) return zoom > 1 ? 'grab' : 'zoom-in';
  if (mode === 'slider' && zoom <= 1) return 'col-resize';
  return zoom > 1 ? 'grab' : 'zoom-in';
}
