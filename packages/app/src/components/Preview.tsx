/**
 * Preview — native image comparison workspace.
 *
 * Same-size outputs default to a split slider for quick compression-quality checks.
 * Resized outputs default to a two-up compare view with synchronized zoom/pan.
 */

import {
  FiArrowLeft,
  FiChevronLeft,
  FiChevronRight,
  FiColumns,
  FiImage,
  FiMaximize,
  FiSliders,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ImageFile } from '../types';
import { formatFileSize, compressionRatio } from '../utils/fileUtils';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileStore } from '../stores/fileStore';
import { cloneSettings } from '../utils/settingsUtils';
import {
  getDefaultCompareMode,
  isCompareModeAvailable,
  type CompareMode,
} from '../utils/previewUtils';
import { PREVIEW_TEST_IDS } from '../utils/previewLayers';
import { FileSettingsPanel } from './FileSettingsPanel';

interface PreviewProps {
  file: ImageFile | null;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onBackToList?: () => void;
  showBackButton?: boolean;
}

interface CompareViewport {
  zoom: number;
  panX: number;
  panY: number;
}

const DEFAULT_VIEWPORT: CompareViewport = { zoom: 1, panX: 0, panY: 0 };

interface ImageMeta {
  label: string;
  src: string;
  size: string;
  dimensions?: string;
  ratio?: number;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function Preview({
  file,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onBackToList,
  showBackButton = false,
}: PreviewProps) {
  const { t } = useTranslation();
  const globalSettings = useSettingsStore((s) => s.settings);
  const setFileCustomSettings = useFileStore((s) => s.setFileCustomSettings);
  const resetFileToGlobal = useFileStore((s) => s.resetFileToGlobal);
  const isMobile = useIsMobile();

  const [viewport, setViewport] = useState<CompareViewport>({ zoom: 1, panX: 0, panY: 0 });
  const [sliderPos, setSliderPos] = useState(50);
  const [compareMode, setCompareMode] = useState<CompareMode>('single');
  const [isInteracting, setIsInteracting] = useState(false);

  const isPanning = useRef(false);
  const isDraggingSlider = useRef(false);
  const isInspecting = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<CompareViewport>(DEFAULT_VIEWPORT);
  const pendingViewportRef = useRef<CompareViewport | null>(null);
  const rafId = useRef<number | null>(null);

  const ratio = file?.result ? compressionRatio(file.originalSize, file.result.size) : 0;
  const hasResult = !!file?.result;
  const isCustom = file?.settingsMode === 'custom';
  const hasDimensionChange =
    !!file?.outputMeta &&
    (file.outputMeta.originalWidth !== file.outputMeta.outputWidth ||
      file.outputMeta.originalHeight !== file.outputMeta.outputHeight);
  const defaultCompareMode = getDefaultCompareMode({ hasResult, hasDimensionChange, isMobile });
  const activeCompareMode = isCompareModeAvailable(compareMode, hasResult)
    ? compareMode
    : defaultCompareMode;

  const imageTransform =
    'translate3d(calc(-50% + var(--preview-pan-x, 0px)), calc(-50% + var(--preview-pan-y, 0px)), 0) scale3d(var(--preview-zoom, 1), var(--preview-zoom, 1), 1)';
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
    if (!file?.result) return null;
    return {
      label: t('preview.compressed'),
      src: file.result.previewUrl,
      size: formatFileSize(file.result.size),
      dimensions: file.outputMeta
        ? `${file.outputMeta.outputWidth}×${file.outputMeta.outputHeight}`
        : undefined,
      ratio,
    };
  }, [file, ratio, t]);

  useEffect(() => {
    viewportRef.current = DEFAULT_VIEWPORT;
    pendingViewportRef.current = null;
    if (rafId.current !== null) {
      window.cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const container = containerRef.current;
    if (container) {
      container.style.setProperty('--preview-pan-x', '0px');
      container.style.setProperty('--preview-pan-y', '0px');
      container.style.setProperty('--preview-zoom', '1');
    }
    setViewport(DEFAULT_VIEWPORT);
    setSliderPos(50);
    setCompareMode(defaultCompareMode);
  }, [file?.id, defaultCompareMode]);

  useEffect(() => {
    if (!file) return;
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [file, hasPrev, hasNext, onPrev, onNext]);

  const applyViewportVars = useCallback((nextViewport: CompareViewport) => {
    const container = containerRef.current;
    if (!container) return;
    container.style.setProperty('--preview-pan-x', `${nextViewport.panX}px`);
    container.style.setProperty('--preview-pan-y', `${nextViewport.panY}px`);
    container.style.setProperty('--preview-zoom', `${nextViewport.zoom}`);
  }, []);

  const commitViewport = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = null;
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      applyViewportVars(nextViewport);
      setViewport(nextViewport);
    },
    [applyViewportVars],
  );

  const scheduleViewportFrame = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = nextViewport;
      if (rafId.current !== null) return;

      rafId.current = window.requestAnimationFrame(() => {
        rafId.current = null;
        const pending = pendingViewportRef.current;
        if (!pending) return;
        pendingViewportRef.current = null;
        applyViewportVars(pending);
      });
    },
    [applyViewportVars],
  );

  const applyTransientViewport = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = null;
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      applyViewportVars(nextViewport);
    },
    [applyViewportVars],
  );

  useEffect(() => {
    viewportRef.current = viewport;
    if (!isPanning.current) {
      applyViewportVars(viewport);
    }
  }, [applyViewportVars, viewport]);

  useEffect(
    () => () => {
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    },
    [],
  );

  const resetViewport = useCallback(() => {
    commitViewport(DEFAULT_VIEWPORT);
  }, [commitViewport]);

  const setZoomLevel = useCallback(
    (zoom: number) => {
      const nextViewport = {
        zoom,
        panX: zoom === 1 ? 0 : viewportRef.current.panX,
        panY: zoom === 1 ? 0 : viewportRef.current.panY,
      };
      commitViewport(nextViewport);
    },
    [commitViewport],
  );

  const updateSliderFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(2, Math.min(98, x)));
  }, []);

  const getInspectPan = useCallback((target: HTMLElement, clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relativeY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      panX: (0.5 - relativeX) * rect.width,
      panY: (0.5 - relativeY) * rect.height,
    };
  }, []);

  const applyInteractionMove = useCallback(
    (clientX: number, clientY: number) => {
      if (isDraggingSlider.current) {
        updateSliderFromClientX(clientX);
        return;
      }

      if (!isPanning.current) return;

      scheduleViewportFrame({
        ...viewportRef.current,
        panX: panStart.current.panX + clientX - panStart.current.x,
        panY: panStart.current.panY + clientY - panStart.current.y,
      });
    },
    [scheduleViewportFrame, updateSliderFromClientX],
  );

  const finishInteraction = useCallback(() => {
    const shouldResetInspect = isInspecting.current;
    const shouldCommitPan = isPanning.current && !shouldResetInspect;
    const finalViewport = viewportRef.current;

    isPanning.current = false;
    isDraggingSlider.current = false;
    isInspecting.current = false;
    activePointerId.current = null;
    setIsInteracting(false);

    if (shouldResetInspect) {
      commitViewport(DEFAULT_VIEWPORT);
    } else if (shouldCommitPan) {
      commitViewport(finalViewport);
    }
  }, [commitViewport]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent) => {
      event.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const isPinch = event.ctrlKey;
      const delta = isPinch ? -event.deltaY * 0.01 : -event.deltaY * 0.002;
      const currentViewport = viewportRef.current;
      const nextZoom = Math.max(
        1,
        Math.min(5, currentViewport.zoom + delta * currentViewport.zoom),
      );

      if (nextZoom === currentViewport.zoom) return;

      const mouseX = event.clientX - rect.left - rect.width / 2;
      const mouseY = event.clientY - rect.top - rect.height / 2;
      const scale = nextZoom / currentViewport.zoom;

      commitViewport({
        zoom: nextZoom,
        panX: mouseX - scale * (mouseX - currentViewport.panX),
        panY: mouseY - scale * (mouseY - currentViewport.panY),
      });
    },
    [commitViewport],
  );

  const beginPointerInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    activePointerId.current = event.pointerId;
    return true;
  }, []);

  const handlePanPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const currentViewport = viewportRef.current;
      if (currentViewport.zoom <= 1) return;
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      isPanning.current = true;
      isInspecting.current = false;
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: currentViewport.panX,
        panY: currentViewport.panY,
      };
    },
    [beginPointerInteraction],
  );

  const handleSliderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      isDraggingSlider.current = true;
      isInspecting.current = false;
      updateSliderFromClientX(event.clientX);
    },
    [beginPointerInteraction, updateSliderFromClientX],
  );

  const handleInspectPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      const currentViewport = viewportRef.current;

      if (currentViewport.zoom > 1) {
        isPanning.current = true;
        isInspecting.current = false;
        panStart.current = {
          x: event.clientX,
          y: event.clientY,
          panX: currentViewport.panX,
          panY: currentViewport.panY,
        };
        return;
      }

      const nextPan = getInspectPan(event.currentTarget, event.clientX, event.clientY);
      isPanning.current = true;
      isInspecting.current = true;
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: nextPan.panX,
        panY: nextPan.panY,
      };
      applyTransientViewport({
        zoom: 2,
        panX: nextPan.panX,
        panY: nextPan.panY,
      });
    },
    [applyTransientViewport, beginPointerInteraction, getInspectPan],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      if (!isDraggingSlider.current && !isPanning.current) return;
      event.preventDefault();
      applyInteractionMove(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      finishInteraction();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [applyInteractionMove, finishInteraction]);

  const handleCustomize = useCallback(() => {
    if (!file) return;
    setFileCustomSettings(file.id, cloneSettings(globalSettings));
  }, [file, globalSettings, setFileCustomSettings]);

  const handleUseGlobal = useCallback(() => {
    if (!file) return;
    resetFileToGlobal(file.id, globalSettings);
  }, [file, globalSettings, resetFileToGlobal]);

  if (!file || !originalMeta) {
    return (
      <div className="pf-preview-empty">
        <span>{t('preview.selectHint')}</span>
      </div>
    );
  }

  return (
    <div className="pf-preview">
      <PreviewHeader
        file={file}
        isCustom={!!isCustom}
        hasResult={hasResult}
        hasPrev={hasPrev}
        hasNext={hasNext}
        showBackButton={showBackButton}
        onBackToList={onBackToList}
        onPrev={onPrev}
        onNext={onNext}
        onCustomize={handleCustomize}
        onUseGlobal={handleUseGlobal}
        compareMode={activeCompareMode}
        onCompareModeChange={setCompareMode}
        zoom={viewport.zoom}
        onSetZoom={setZoomLevel}
        onResetZoom={resetViewport}
      />

      {isCustom && <FileSettingsPanel file={file} />}

      <div
        ref={containerRef}
        data-testid={PREVIEW_TEST_IDS.viewport}
        className="pf-preview-viewport"
        style={{
          ...previewViewportStyle,
          cursor: getPreviewCursor(activeCompareMode, viewport.zoom, hasResult),
        }}
        onWheel={handleWheel}
      >
        {activeCompareMode === 'sideBySide' && outputMeta ? (
          <SideBySideCompareView
            original={originalMeta}
            output={outputMeta}
            imageTransform={imageTransform}
            isPanning={isInteracting}
            onPointerDown={handleInspectPointerDown}
          />
        ) : activeCompareMode === 'slider' && outputMeta ? (
          <SliderCompareView
            original={originalMeta}
            output={outputMeta}
            imageTransform={imageTransform}
            sliderPos={sliderPos}
            isPanning={isInteracting}
            ratio={ratio}
            onPointerDown={viewport.zoom > 1 ? handlePanPointerDown : handleSliderPointerDown}
          />
        ) : (
          <SingleImageView
            image={outputMeta ?? originalMeta}
            imageTransform={imageTransform}
            isPanning={isInteracting}
            onPointerDown={handleInspectPointerDown}
          />
        )}

        {(file.status === 'processing' || file.status === 'pending') && !hasResult && (
          <ProcessingOverlay progress={file.progress} />
        )}
      </div>
    </div>
  );
}

function PreviewHeader({
  file,
  isCustom,
  hasResult,
  hasPrev,
  hasNext,
  showBackButton,
  onBackToList,
  onPrev,
  onNext,
  onCustomize,
  onUseGlobal,
  compareMode,
  onCompareModeChange,
  zoom,
  onSetZoom,
  onResetZoom,
}: {
  file: ImageFile;
  isCustom: boolean;
  hasResult: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  showBackButton: boolean;
  onBackToList?: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCustomize: () => void;
  onUseGlobal: () => void;
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  onResetZoom: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="pf-preview-header">
      <div className="pf-preview-nav">
        {showBackButton && onBackToList && (
          <IconControl
            className="pf-preview-back"
            label={t('preview.backToList')}
            onClick={onBackToList}
            icon={<FiArrowLeft aria-hidden="true" />}
          />
        )}
        <IconControl
          label={t('preview.previous')}
          onClick={onPrev}
          disabled={!hasPrev}
          icon={<FiChevronLeft aria-hidden="true" />}
        />
        <span className="pf-preview-filename" title={file.file.name}>
          {file.file.name}
        </span>
        <IconControl
          label={t('preview.next')}
          onClick={onNext}
          disabled={!hasNext}
          icon={<FiChevronRight aria-hidden="true" />}
        />
      </div>

      <div className="pf-preview-tools" data-testid={PREVIEW_TEST_IDS.toolbarLayer}>
        {hasResult && <CompareModeSwitch mode={compareMode} onChange={onCompareModeChange} />}
        <span className={`pf-preview-mode-badge${isCustom ? ' is-custom' : ''}`}>
          {isCustom ? t('settings.mode.custom') : t('settings.mode.global')}
        </span>
        <button
          type="button"
          className="pf-preview-text-button"
          onClick={isCustom ? onUseGlobal : onCustomize}
        >
          {isCustom ? t('actions.useGlobalSettings') : t('actions.customizeImage')}
        </button>
        <ZoomControls zoom={zoom} onSetZoom={onSetZoom} onResetZoom={onResetZoom} />
      </div>
    </header>
  );
}

function IconControl({
  label,
  icon,
  disabled,
  className = '',
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`pf-icon-control ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function CompareModeSwitch({
  mode,
  onChange,
}: {
  mode: CompareMode;
  onChange: (mode: CompareMode) => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ mode: CompareMode; icon: JSX.Element; label: string }> = [
    { mode: 'slider', icon: <FiSliders aria-hidden="true" />, label: t('preview.modes.slider') },
    {
      mode: 'sideBySide',
      icon: <FiColumns aria-hidden="true" />,
      label: t('preview.modes.sideBySide'),
    },
    { mode: 'single', icon: <FiImage aria-hidden="true" />, label: t('preview.modes.single') },
  ];

  return (
    <div className="pf-compare-mode-switch" role="group" aria-label={t('preview.compareMode')}>
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          className={`pf-compare-mode-button${mode === option.mode ? ' is-active' : ''}`}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.mode)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function ZoomControls({
  zoom,
  onSetZoom,
  onResetZoom,
}: {
  zoom: number;
  onSetZoom: (zoom: number) => void;
  onResetZoom: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="pf-zoom-controls">
      <button
        type="button"
        className={`pf-preview-zoom-button${zoom === 1 ? ' is-active' : ''}`}
        onClick={() => onSetZoom(1)}
      >
        {t('preview.zoom.fit')}
      </button>
      <button
        type="button"
        className={`pf-preview-zoom-button${zoom === 2 ? ' is-active' : ''}`}
        onClick={() => onSetZoom(2)}
      >
        2x
      </button>
      {zoom > 1 && (
        <IconControl
          label={t('preview.zoomReset')}
          onClick={onResetZoom}
          icon={<FiMaximize aria-hidden="true" />}
        />
      )}
      <span className="pf-preview-zoom-value">{Math.round(zoom * 100)}%</span>
    </div>
  );
}

function SideBySideCompareView({
  original,
  output,
  imageTransform,
  isPanning,
  onPointerDown,
}: {
  original: ImageMeta;
  output: ImageMeta;
  imageTransform: string;
  isPanning: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div data-testid={PREVIEW_TEST_IDS.sideBySideRoot} className="pf-preview-side-by-side">
      <PreviewPane
        image={original}
        imageTransform={imageTransform}
        isPanning={isPanning}
        divider
        onPointerDown={onPointerDown}
      />
      <PreviewPane
        image={output}
        imageTransform={imageTransform}
        isPanning={isPanning}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

function SliderCompareView({
  original,
  output,
  imageTransform,
  sliderPos,
  isPanning,
  ratio,
  onPointerDown,
}: {
  original: ImageMeta;
  output: ImageMeta;
  imageTransform: string;
  sliderPos: number;
  isPanning: boolean;
  ratio: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      data-testid={PREVIEW_TEST_IDS.sliderRoot}
      className="pf-slider-compare"
      onPointerDown={onPointerDown}
    >
      <div data-testid={PREVIEW_TEST_IDS.sliderImageLayer} className="pf-slider-image-layer">
        <PreviewImage
          src={original.src}
          alt={original.label}
          imageTransform={imageTransform}
          isPanning={isPanning}
        />
        <PreviewImage
          src={output.src}
          alt={output.label}
          imageTransform={imageTransform}
          isPanning={isPanning}
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        />
      </div>
      <div data-testid={PREVIEW_TEST_IDS.sliderOverlayLayer} className="pf-slider-overlay-layer">
        <span className="pf-slider-line" style={{ left: `${sliderPos}%` }} aria-hidden="true" />
        <span className="pf-slider-handle" style={{ left: `${sliderPos}%` }} aria-hidden="true">
          ⇄
        </span>
        <PreviewLabel text={output.label} top left isInteracting={isPanning} />
        <PreviewLabel text={original.label} top right isInteracting={isPanning} />
        <CompareSummary
          originalSize={original.size}
          outputSize={output.size}
          ratio={ratio}
          isInteracting={isPanning}
        />
      </div>
    </div>
  );
}

function SingleImageView({
  image,
  imageTransform,
  isPanning,
  onPointerDown,
}: {
  image: ImageMeta;
  imageTransform: string;
  isPanning: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div data-testid={PREVIEW_TEST_IDS.singleRoot} className="pf-preview-single">
      <PreviewPane
        image={image}
        imageTransform={imageTransform}
        isPanning={isPanning}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

function PreviewPane({
  image,
  imageTransform,
  isPanning,
  divider = false,
  onPointerDown,
}: {
  image: ImageMeta;
  imageTransform: string;
  isPanning: boolean;
  divider?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      data-testid={PREVIEW_TEST_IDS.pane}
      className={`pf-preview-pane${divider ? ' has-divider' : ''}`}
      onPointerDown={onPointerDown}
    >
      <div data-testid={PREVIEW_TEST_IDS.paneImageLayer} className="pf-preview-pane-image-layer">
        <PreviewImage
          src={image.src}
          alt={image.label}
          imageTransform={imageTransform}
          isPanning={isPanning}
        />
      </div>
      <div
        data-testid={PREVIEW_TEST_IDS.paneOverlayLayer}
        className="pf-preview-pane-overlay-layer"
      >
        <PreviewLabel text={image.label} top left isInteracting={isPanning} />
        <ImageInfoBadge image={image} isInteracting={isPanning} />
      </div>
    </div>
  );
}

function PreviewImage({
  src,
  alt,
  imageTransform,
  isPanning,
  style,
}: {
  src: string;
  alt: string;
  imageTransform: string;
  isPanning: boolean;
  style?: CSSProperties;
}) {
  return (
    <img
      data-testid={PREVIEW_TEST_IDS.previewImage}
      className="pf-preview-image"
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      style={{
        transform: imageTransform,
        transition: isPanning ? 'none' : 'transform 0.1s ease',
        ...style,
      }}
    />
  );
}

function PreviewLabel({
  text,
  top,
  left,
  right,
  isInteracting = false,
}: {
  text: string;
  top: boolean;
  left?: boolean;
  right?: boolean;
  isInteracting?: boolean;
}) {
  return (
    <span
      data-testid={PREVIEW_TEST_IDS.previewLabel}
      className={`pf-preview-label${top ? ' is-top' : ''}${left ? ' is-left' : ''}${right ? ' is-right' : ''}${isInteracting ? ' is-interacting' : ''}`}
    >
      {text}
    </span>
  );
}

function ImageInfoBadge({
  image,
  isInteracting = false,
}: {
  image: ImageMeta;
  isInteracting?: boolean;
}) {
  const isPositive = !!image.ratio && image.ratio > 0;

  return (
    <div
      data-testid={PREVIEW_TEST_IDS.previewInfoBadge}
      className={`pf-preview-info-badge${isInteracting ? ' is-interacting' : ''}`}
    >
      {image.dimensions && <span className="pf-preview-dimensions">{image.dimensions}</span>}
      <span className="pf-preview-info-row">
        <span className="pf-preview-info-size">{image.size}</span>
        {image.ratio !== undefined && (
          <span className={`pf-preview-ratio-badge${isPositive ? ' is-positive' : ' is-negative'}`}>
            {image.ratio > 0 ? `-${image.ratio}%` : `+${Math.abs(image.ratio)}%`}
          </span>
        )}
      </span>
    </div>
  );
}

function CompareSummary({
  originalSize,
  outputSize,
  ratio,
  isInteracting = false,
}: {
  originalSize: string;
  outputSize: string;
  ratio: number;
  isInteracting?: boolean;
}) {
  return (
    <div
      data-testid={PREVIEW_TEST_IDS.compareSummary}
      className={`pf-preview-compare-summary${isInteracting ? ' is-interacting' : ''}`}
    >
      <span className="pf-preview-summary-muted">{originalSize}</span>
      <span className="pf-preview-summary-arrow">→</span>
      <span className="pf-preview-summary-strong">{outputSize}</span>
      <span className={`pf-preview-ratio-badge${ratio > 0 ? ' is-positive' : ' is-negative'}`}>
        {ratio > 0 ? `-${ratio}%` : `+${Math.abs(ratio)}%`}
      </span>
    </div>
  );
}

function ProcessingOverlay({ progress }: { progress: number }) {
  const { t } = useTranslation();

  return (
    <div className="pf-processing-overlay">
      <div className="pf-processing-card">
        <span className="pf-processing-spinner" aria-hidden="true" />
        <span className="pf-processing-progress">{progress}%</span>
        <span className="pf-processing-copy">{t('preview.compressing')}</span>
      </div>
    </div>
  );
}

function getPreviewCursor(mode: CompareMode, zoom: number, hasResult: boolean): string {
  if (!hasResult) return zoom > 1 ? 'grab' : 'zoom-in';
  if (mode === 'slider' && zoom <= 1) return 'col-resize';
  return zoom > 1 ? 'grab' : 'zoom-in';
}
