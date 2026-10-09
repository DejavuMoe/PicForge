import type { ReactNode } from 'react';
import { FiColumns, FiMaximize, FiSliders, FiZoomIn, FiZoomOut } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../../components/ui/IconButton';
import { Select } from '../../../components/ui/Select';
import { PREVIEW_TEST_IDS } from '../../../utils/previewLayers';
import type { CompareMode } from '../../../utils/previewUtils';

export type StageView = 'original' | 'result' | 'compare';

/** The stage dock: what is shown, how large, and fullscreen. It never overlaps the image. */
export function ViewBar({
  view,
  mode,
  hasResult,
  zoom,
  showFullscreen,
  onView,
  onCompare,
  onSetZoom,
  onResetZoom,
  onFullscreen,
}: {
  view: StageView;
  mode: CompareMode;
  hasResult: boolean;
  zoom: number;
  showFullscreen: boolean;
  onView: (view: 'original' | 'result') => void;
  onCompare: (mode: CompareMode) => void;
  onSetZoom: (zoom: number) => void;
  onResetZoom: () => void;
  onFullscreen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <footer className="pf-viewer-footer">
      <div className="pf-viewer-controls pf-preview-controls">
        <ViewSwitch
          view={view}
          mode={mode}
          hasResult={hasResult}
          onView={onView}
          onCompare={onCompare}
        />
        <span className="pf-dock-rule" aria-hidden />
        <ZoomControls zoom={zoom} onSetZoom={onSetZoom} onResetZoom={onResetZoom} />
        {showFullscreen && (
          <>
            <span className="pf-dock-rule" aria-hidden />
            <IconButton
              className="pf-dock-button"
              label={t('preview.fullscreen')}
              disabled={!document.fullscreenEnabled}
              icon={<FiMaximize aria-hidden />}
              onClick={onFullscreen}
            />
          </>
        )}
      </div>
    </footer>
  );
}

/** One switch for what the stage shows: either image alone, or a comparison layout. */
function ViewSwitch({
  view,
  mode,
  hasResult,
  onView,
  onCompare,
}: {
  view: StageView;
  mode: CompareMode;
  hasResult: boolean;
  onView: (view: 'original' | 'result') => void;
  onCompare: (mode: CompareMode) => void;
}) {
  const { t } = useTranslation();
  const comparisons: Array<{ mode: CompareMode; icon: ReactNode; label: string }> = [
    { mode: 'slider', icon: <FiSliders aria-hidden />, label: t('preview.modes.slider') },
    { mode: 'sideBySide', icon: <FiColumns aria-hidden />, label: t('preview.modes.sideBySide') },
  ];
  return (
    <div
      className="pf-view-switch"
      role="group"
      aria-label={t('preview.compareMode')}
      data-testid={PREVIEW_TEST_IDS.toolbarLayer}
    >
      {(['original', 'result'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          disabled={value === 'result' && !hasResult}
          onClick={() => onView(value)}
        >
          {t(`workbench.${value}`)}
        </button>
      ))}
      <span className="pf-view-switch-rule" aria-hidden />
      {comparisons.map((option) => (
        <button
          key={option.mode}
          type="button"
          className="is-icon"
          aria-label={option.label}
          aria-pressed={view === 'compare' && mode === option.mode}
          data-tooltip={option.label}
          disabled={!hasResult}
          onClick={() => onCompare(option.mode)}
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
  const levels = [...new Set([1, 1.5, 2, 3, 4, zoom])].sort((a, b) => a - b);
  return (
    <div className="pf-zoom-controls">
      <IconButton
        className="pf-dock-button"
        label={t('preview.zoomOut')}
        disabled={zoom <= 1}
        icon={<FiZoomOut aria-hidden />}
        onClick={() => onSetZoom(Math.max(1, zoom / 1.5))}
      />
      <Select
        variant="quiet"
        className="pf-zoom-select"
        aria-label={t('preview.zoomLevel')}
        value={zoom}
        onValueChange={(value) => (Number(value) === 1 ? onResetZoom() : onSetZoom(Number(value)))}
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {level === 1 ? t('preview.zoom.fit') : `${Math.round(level * 100)}%`}
          </option>
        ))}
      </Select>
      <IconButton
        className="pf-dock-button"
        label={t('preview.zoomIn')}
        disabled={zoom >= 4}
        icon={<FiZoomIn aria-hidden />}
        onClick={() => onSetZoom(Math.min(4, zoom * 1.5))}
      />
    </div>
  );
}
