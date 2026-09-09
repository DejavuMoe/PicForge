import { SelectionRail } from './SelectionRail';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiDownload } from 'react-icons/fi';
import type { CompressSettings, OutputFormat, ResizeMethod } from '@pic-forge/codecs';
import { AVIF_CHROMA_SUBSAMPLE } from '@pic-forge/codecs';
import { SelectControl } from './SelectControl';
import { NumberControl } from './NumberControl';
import { Inspector, SwitchControl } from './WorkbenchLayout';
import { ConfirmDialog } from './ConfirmDialog';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileStore } from '../stores/fileStore';
import { PRESETS } from '../stores/presets';
import { FORMAT_OPTIONS, type ImageFile } from '../types';
import { cloneSettings } from '../utils/settingsUtils';
import { formatFileSize, compressionRatio } from '../utils/fileUtils';
import { getOutputName, isResultExportable } from '../utils/exportManifest';
import { getRangeProgressStyle } from '../utils/rangeProgress';

const DEFAULT_RESIZE: NonNullable<CompressSettings['resize']> = {
  enabled: false,
  mode: 'absolute',
  maxWidth: 1920,
  maxHeight: 1080,
  percentage: 50,
  method: 'contain',
};
interface SettingsFieldsProps {
  settings: CompressSettings;
  updateSettings: (partial: Partial<CompressSettings>) => void;
}

/** One inspector for global settings and complete per-file snapshots. */
export function Toolbar({ file }: { file: ImageFile | null }) {
  const { t } = useTranslation();
  const global = useSettingsStore((state) => state.settings);
  const updateGlobal = useSettingsStore((state) => state.updateSettings);
  const resetGlobal = useSettingsStore((state) => state.resetToDefaults);
  const hasCustomFiles = useFileStore((state) =>
    state.files.some((item) => item.settingsMode === 'custom'),
  );
  const [scope, setScope] = useState<'global' | 'file'>(
    file?.settingsMode === 'custom' ? 'file' : 'global',
  );
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    setScope(file?.settingsMode === 'custom' ? 'file' : 'global');
  }, [file?.id, file?.settingsMode]);
  const settings = scope === 'file' && file?.customSettings ? file.customSettings : global;
  const updateSettings = (partial: Partial<CompressSettings>) => {
    if (scope === 'file' && file)
      useFileStore.getState().updateFileCustomSettings(file.id, partial);
    else updateGlobal(partial);
  };
  const chooseFile = () => {
    if (!file) return;
    if (file.settingsMode !== 'custom')
      useFileStore.getState().setFileCustomSettings(file.id, cloneSettings(global));
    setScope('file');
  };
  const exportable = file && isResultExportable(file, global);
  const saving = exportable ? compressionRatio(file.originalSize, file.result!.size) : 0;
  const download = async () => {
    if (!file || !isResultExportable(file, global)) return;
    const { saveAs } = await import('file-saver');
    saveAs(file.result!.blob, getOutputName(file, global));
  };
  return (
    <Inspector
      title={t('workbench.outputSettings')}
      footer={
        file && (
          <>
            <div className="pf-result-summary">
              <div>
                <span>{t('workbench.original')}</span>
                <strong>{formatFileSize(file.originalSize)}</strong>
              </div>
              <FiArrowRight aria-hidden />
              <div>
                <span>{t('workbench.result')}</span>
                <strong>
                  {exportable ? formatFileSize(file.result!.size) : t('workbench.notReady')}
                </strong>
              </div>
            </div>
            {exportable && (
              <p className={`pf-result-saving${saving < 0 ? ' is-larger' : ''}`}>
                {saving === 0
                  ? t('progress.noChange')
                  : t(saving > 0 ? 'workbench.smaller' : 'workbench.larger', {
                      percent: Math.abs(saving),
                    })}
              </p>
            )}
            <button
              className="pf-button pf-download-current"
              disabled={!exportable}
              onClick={download}
            >
              <FiDownload aria-hidden />
              {t('workbench.downloadCurrent')}
            </button>
          </>
        )
      }
    >
      <SelectionRail
        className="pf-scope-switch"
        role="group"
        aria-label={t('workbench.settingsScope')}
      >
        <button aria-pressed={scope === 'global'} onClick={() => setScope('global')}>
          {t('workbench.allImages')}
        </button>
        <button aria-pressed={scope === 'file'} disabled={!file} onClick={chooseFile}>
          {t('workbench.thisImage')}
        </button>
      </SelectionRail>
      {hasCustomFiles && scope === 'global' && (
        <p className="pf-field-hint">{t('workbench.globalHint')}</p>
      )}
      {scope === 'file' && file && (
        <div className="pf-scope-note">
          <p>{t('workbench.customHint')}</p>
          <button
            className="pf-text-button"
            onClick={() => useFileStore.getState().resetFileToGlobal(file.id, global)}
          >
            {t('actions.useGlobalSettings')}
          </button>
        </div>
      )}
      <SettingsFields settings={settings} updateSettings={updateSettings} />
      <details className="pf-settings-extra">
        <summary>{t('settings.title')}</summary>
        <div className="pf-preset-list">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="pf-button"
              title={t(preset.descriptionKey)}
              onClick={() => updateSettings(preset.settings)}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
        {scope === 'global' && (
          <button
            className="pf-text-button"
            onClick={(event) => {
              event.currentTarget.focus();
              setResetOpen(true);
            }}
          >
            {t('actions.resetDefaults')}
          </button>
        )}
      </details>
      {resetOpen && (
        <ConfirmDialog
          title={t('dialog.resetTitle')}
          body={t('workbench.resetBody')}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            resetGlobal();
            setResetOpen(false);
          }}
        />
      )}
    </Inspector>
  );
}

function SettingsFields({ settings, updateSettings }: SettingsFieldsProps) {
  const { t } = useTranslation();
  const resize = settings.resize ?? DEFAULT_RESIZE;
  const lossless = settings.outputFormat === 'oxipng';
  const updateResize = (partial: Partial<typeof resize>) =>
    updateSettings({ resize: { ...resize, ...partial } });
  return (
    <div className="pf-settings-fields" data-testid="toolbar">
      <label className="pf-field">
        <span>{t('workbench.format')}</span>
        <SelectControl
          value={settings.outputFormat}
          aria-label={t('workbench.format')}
          onValueChange={(value) => updateSettings({ outputFormat: value as OutputFormat })}
        >
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      </label>
      <div className="pf-field">
        <label htmlFor="pf-global-quality">{t('settings.quality')}</label>
        <div className="pf-range-field">
          <input
            id="pf-global-quality"
            disabled={lossless}
            type="range"
            min={0}
            max={100}
            value={settings.quality}
            aria-label={t('settings.quality')}
            style={getRangeProgressStyle(settings.quality, 0, 100)}
            onChange={(event) => updateSettings({ quality: Number(event.target.value) })}
          />
          <NumberControl
            className="pf-number-value"
            disabled={lossless}
            min={0}
            max={100}
            value={settings.quality}
            aria-label={t('workbench.qualityValue')}
            onValueChange={(quality) => updateSettings({ quality })}
          />
        </div>
        {lossless && <p className="pf-quality-hint">{t('workbench.losslessHint')}</p>}
      </div>
      <section className="pf-settings-section">
        <div className="pf-field-heading">
          <span>{t('settings.resize')}</span>
          <SwitchControl
            checked={resize.enabled}
            ariaLabel={t('settings.resize')}
            onChange={(enabled) => updateResize({ enabled })}
          />
        </div>
        <fieldset
          hidden={!resize.enabled}
          disabled={!resize.enabled}
          className="pf-resize-controls"
        >
          {resize.mode === 'absolute' ? (
            <div className="pf-dimensions pf-dimensions-inline">
              <label className="pf-field">
                <span>
                  {t(resize.method === 'contain' ? 'workbench.maxWidth' : 'settings.width')}
                </span>
                <span className="pf-unit-input">
                  <NumberControl
                    min={1}
                    max={10000}
                    value={resize.maxWidth}
                    aria-label={t('settings.width')}
                    onValueChange={(maxWidth) => updateResize({ maxWidth })}
                  />
                  <span aria-hidden="true">px</span>
                </span>
              </label>
              <label className="pf-field">
                <span>
                  {t(resize.method === 'contain' ? 'workbench.maxHeight' : 'settings.height')}
                </span>
                <span className="pf-unit-input">
                  <NumberControl
                    min={1}
                    max={10000}
                    value={resize.maxHeight}
                    aria-label={t('settings.height')}
                    onValueChange={(maxHeight) => updateResize({ maxHeight })}
                  />
                  <span aria-hidden="true">px</span>
                </span>
              </label>
            </div>
          ) : (
            <label className="pf-field">
              <span>{t('settings.percentageMode')}</span>
              <div className="pf-range-field">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={resize.percentage}
                  style={getRangeProgressStyle(resize.percentage, 1, 100)}
                  onChange={(event) => updateResize({ percentage: Number(event.target.value) })}
                />
                <NumberControl
                  className="pf-number-value"
                  min={1}
                  max={100}
                  value={resize.percentage}
                  aria-label={t('settings.percentageMode')}
                  onValueChange={(percentage) => updateResize({ percentage })}
                />
              </div>
            </label>
          )}
          <label className="pf-field pf-field-inline">
            <span>{t('settings.fitMethod')}</span>
            <SelectControl
              disabled={!resize.enabled}
              value={resize.method}
              aria-label={t('settings.fitMethod')}
              onValueChange={(value) => updateResize({ method: value as ResizeMethod })}
            >
              {(['contain', 'cover', 'stretch'] as const).map((method) => (
                <option key={method} value={method}>
                  {t(`settings.fit.${method}`)}
                </option>
              ))}
            </SelectControl>
          </label>
        </fieldset>
        {resize.enabled && resize.method === 'contain' && (
          <p className="pf-field-hint">{t('workbench.containHint')}</p>
        )}
      </section>
      <details className="pf-settings-extra">
        <summary>{t('settings.advancedTitle')}</summary>
        <fieldset disabled={!resize.enabled} className="pf-resize-mode-setting">
          <legend>{t('settings.resizeSettings')}</legend>
          <div className="pf-segmented" role="group" aria-label={t('settings.resizeSettings')}>
            <button
              aria-pressed={resize.mode === 'absolute'}
              onClick={() => updateResize({ mode: 'absolute' })}
            >
              {t('settings.absoluteMode')}
            </button>
            <button
              aria-pressed={resize.mode === 'percentage'}
              onClick={() => updateResize({ mode: 'percentage' })}
            >
              {t('settings.percentageMode')}
            </button>
          </div>
        </fieldset>
        <AdvancedControls settings={settings} updateSettings={updateSettings} />
      </details>
    </div>
  );
}
function AdvancedControls({ settings, updateSettings }: SettingsFieldsProps) {
  const { t } = useTranslation();
  const format = settings.outputFormat;
  const advanced = (settings.advanced ?? {}) as Record<string, unknown>;

  const updateAdvanced = (key: string, value: unknown) => {
    updateSettings({ advanced: { ...advanced, [key]: value } });
  };

  const boolValue = (key: string, fallback: boolean) =>
    typeof advanced[key] === 'boolean' ? (advanced[key] as boolean) : fallback;

  const numberValue = (key: string, fallback: number) =>
    typeof advanced[key] === 'number' ? (advanced[key] as number) : fallback;

  const avifSubsampleValue = (value: number) =>
    value === 0 ? AVIF_CHROMA_SUBSAMPLE.YUV444 : value;

  return (
    <div className="pf-advanced-controls">
      {format === 'mozjpeg' && (
        <>
          <Chip label={t('settings.adv.progressive')} tooltip={t('tooltips.adv.progressive')}>
            <SwitchControl
              checked={boolValue('progressive', true)}
              ariaLabel={t('settings.adv.progressive')}
              onChange={(checked) => updateAdvanced('progressive', checked)}
            />
          </Chip>
          <Chip
            label={t('settings.adv.chromaSubsample')}
            tooltip={t('tooltips.adv.chromaSubsample')}
          >
            <SelectControl
              className="pf-toolbar-select pf-toolbar-select-compact"
              aria-label={t('settings.adv.chromaSubsample')}
              value={numberValue('chroma_subsample', 2)}
              onValueChange={(value) => updateAdvanced('chroma_subsample', Number(value))}
            >
              <option value={1}>4:4:4</option>
              <option value={2}>4:2:0</option>
            </SelectControl>
          </Chip>
          <Chip label={t('settings.adv.trellis')} tooltip={t('tooltips.adv.trellis')}>
            <SwitchControl
              checked={boolValue('trellis_multipass', false)}
              ariaLabel={t('settings.adv.trellis')}
              onChange={(checked) => updateAdvanced('trellis_multipass', checked)}
            />
          </Chip>
        </>
      )}

      {format === 'webp' && (
        <>
          <Chip label={t('settings.adv.lossless')} tooltip={t('tooltips.adv.lossless')}>
            <SwitchControl
              checked={advanced.lossless === 1}
              ariaLabel={t('settings.adv.lossless')}
              onChange={(checked) => updateAdvanced('lossless', checked ? 1 : 0)}
            />
          </Chip>
          <Chip label={t('settings.adv.method')} tooltip={t('tooltips.adv.method')}>
            <SelectControl
              className="pf-toolbar-select pf-toolbar-select-compact"
              aria-label={t('settings.adv.method')}
              value={numberValue('method', 4)}
              onValueChange={(value) => updateAdvanced('method', Number(value))}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectControl>
          </Chip>
          <Chip
            label={t('settings.adv.alphaCompression')}
            tooltip={t('tooltips.adv.alphaCompression')}
          >
            <SwitchControl
              checked={advanced.alpha_compression === 1}
              ariaLabel={t('settings.adv.alphaCompression')}
              onChange={(checked) => updateAdvanced('alpha_compression', checked ? 1 : 0)}
            />
          </Chip>
        </>
      )}

      {format === 'oxipng' && (
        <Chip label={t('settings.adv.interlace')} tooltip={t('tooltips.adv.interlace')}>
          <SwitchControl
            checked={boolValue('interlace', false)}
            ariaLabel={t('settings.adv.interlace')}
            onChange={(checked) => updateAdvanced('interlace', checked)}
          />
        </Chip>
      )}

      {format === 'avif' && (
        <>
          <Chip label={t('settings.adv.speed')} tooltip={t('tooltips.adv.speed')}>
            <SelectControl
              className="pf-toolbar-select pf-toolbar-select-compact"
              aria-label={t('settings.adv.speed')}
              value={numberValue('speed', 6)}
              onValueChange={(value) => updateAdvanced('speed', Number(value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectControl>
          </Chip>
          <Chip label={t('settings.adv.subsample')} tooltip={t('tooltips.adv.subsample')}>
            <SelectControl
              className="pf-toolbar-select pf-toolbar-select-compact"
              aria-label={t('settings.adv.subsample')}
              value={avifSubsampleValue(numberValue('subsample', AVIF_CHROMA_SUBSAMPLE.YUV420))}
              onValueChange={(value) => updateAdvanced('subsample', Number(value))}
            >
              <option value={AVIF_CHROMA_SUBSAMPLE.YUV444}>4:4:4</option>
              <option value={AVIF_CHROMA_SUBSAMPLE.YUV420}>4:2:0</option>
            </SelectControl>
          </Chip>
        </>
      )}
    </div>
  );
}

const Chip = ({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: ReactNode;
}) => (
  <span className="pf-toolbar-chip" title={tooltip}>
    <span className="pf-toolbar-chip-label">{label}</span>
    {children}
  </span>
);
