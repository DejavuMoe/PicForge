/**
 * Toolbar — compression settings bar.
 *
 * Native shell controls keep the frequently used settings surface responsive
 * while preserving the existing settings model.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { CompressSettings, OutputFormat, ResizeMethod } from '@pic-forge/codecs';
import { useSettingsStore } from '../stores/settingsStore';
import { PRESETS, type Preset } from '../stores/presets';
import { FORMAT_OPTIONS } from '../types';
import { getRangeProgressStyle } from '../utils/rangeProgress';

type ResizeSettings = NonNullable<CompressSettings['resize']>;

const DEFAULT_RESIZE: ResizeSettings = {
  enabled: false,
  mode: 'absolute',
  maxWidth: 1920,
  maxHeight: 1080,
  percentage: 50,
  method: 'contain',
};

function isPresetActive(
  settings: { outputFormat: string; quality: number; advanced?: Record<string, unknown> },
  preset: Preset,
): boolean {
  if (settings.outputFormat !== preset.settings.outputFormat) return false;
  if (settings.quality !== preset.settings.quality) return false;
  const adv = settings.advanced ?? {};
  const presetAdv = (preset.settings.advanced ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(presetAdv)) {
    if (adv[key] !== presetAdv[key]) return false;
  }
  return true;
}

function parseBoundedNumber(value: string, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function SwitchControl({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={`pf-switch${checked ? ' is-checked' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
    >
      <span className="pf-switch-thumb" aria-hidden="true" />
    </button>
  );
}

export function Toolbar() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const setOutputFormat = useSettingsStore((s) => s.setOutputFormat);
  const setQuality = useSettingsStore((s) => s.setQuality);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [draftQuality, setDraftQuality] = useState(settings.quality);
  const [showResizeDetails, setShowResizeDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDraftQuality(settings.quality);
  }, [settings.quality]);

  useEffect(() => {
    if (!settings.resize?.enabled) {
      setShowResizeDetails(false);
    }
  }, [settings.resize?.enabled]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!presetMenuRef.current?.contains(event.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!resetOpen) return;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetOpen]);

  const applyPreset = (preset: Preset) => {
    updateSettings({
      outputFormat: preset.settings.outputFormat,
      quality: preset.settings.quality,
      resize: preset.settings.resize,
      advanced: preset.settings.advanced,
    });
    setPresetMenuOpen(false);
  };

  const handleResizeToggle = (enabled: boolean) => {
    updateSettings({ resize: { ...(settings.resize ?? DEFAULT_RESIZE), enabled } });
    setShowResizeDetails(enabled);
  };

  const commitQuality = (value: number) => {
    setDraftQuality(value);
    setQuality(value);
  };

  return (
    <div className="pf-toolbar" data-testid="toolbar">
      <div className="pf-toolbar-row">
        <div className="pf-toolbar-presets-mobile" ref={presetMenuRef}>
          <button
            type="button"
            className="pf-toolbar-button pf-toolbar-button-outline"
            aria-expanded={presetMenuOpen}
            onClick={() => setPresetMenuOpen((open) => !open)}
          >
            <span>{t('settings.title')}</span>
            <FiChevronDown
              className={`pf-toolbar-chevron${presetMenuOpen ? ' is-open' : ''}`}
              aria-hidden="true"
            />
          </button>
          {presetMenuOpen && (
            <div className="pf-toolbar-menu" role="menu">
              {PRESETS.map((preset) => {
                const active = isPresetActive(settings, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`pf-toolbar-menu-item${active ? ' is-active' : ''}`}
                    role="menuitem"
                    onClick={() => applyPreset(preset)}
                  >
                    <span className="pf-toolbar-menu-title">{t(preset.labelKey)}</span>
                    <span className="pf-toolbar-menu-copy">{t(preset.descriptionKey)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pf-toolbar-presets-desktop" aria-label={t('settings.title')}>
          {PRESETS.map((preset) => {
            const active = isPresetActive(settings, preset);
            return (
              <button
                key={preset.id}
                type="button"
                className={`pf-toolbar-button pf-toolbar-preset${active ? ' is-active' : ''}`}
                title={t(preset.descriptionKey)}
                onClick={() => applyPreset(preset)}
              >
                {t(preset.labelKey)}
              </button>
            );
          })}
        </div>

        <span className="pf-toolbar-divider" aria-hidden="true" />

        <select
          className="pf-toolbar-select pf-toolbar-format"
          value={settings.outputFormat}
          title={t('tooltips.formatHint')}
          aria-label={t('tooltips.formatHint')}
          onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
        >
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="pf-toolbar-quality">
          <span className="pf-toolbar-label pf-toolbar-quality-label">{t('settings.quality')}</span>
          <input
            className="pf-toolbar-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftQuality}
            aria-label={t('settings.quality')}
            style={getRangeProgressStyle(draftQuality, 0, 100)}
            onChange={(event) => commitQuality(Number(event.target.value))}
            onInput={(event) => commitQuality(Number(event.currentTarget.value))}
          />
          <span className="pf-toolbar-value">{draftQuality}</span>
        </div>

        <span className="pf-toolbar-divider" aria-hidden="true" />

        <div className="pf-toolbar-actions">
          <label className="pf-toolbar-switch-label">
            <span>{t('settings.resize')}</span>
            <SwitchControl
              checked={!!settings.resize?.enabled}
              ariaLabel={t('settings.resize')}
              onChange={handleResizeToggle}
            />
          </label>

          <button
            type="button"
            className={`pf-toolbar-button pf-toolbar-button-ghost${
              showResizeDetails ? ' is-open' : ''
            }`}
            disabled={!settings.resize?.enabled}
            aria-expanded={showResizeDetails}
            onClick={() => setShowResizeDetails((open) => !open)}
          >
            <span>{t('settings.resizeOptions')}</span>
            <FiChevronDown
              className={`pf-toolbar-chevron${showResizeDetails ? ' is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            className={`pf-toolbar-button pf-toolbar-button-ghost${showAdvanced ? ' is-open' : ''}`}
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            <span>{t('settings.advancedTitle')}</span>
            <FiChevronDown
              className={`pf-toolbar-chevron${showAdvanced ? ' is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            className="pf-toolbar-button pf-toolbar-button-ghost"
            onClick={() => setResetOpen(true)}
          >
            {t('actions.resetDefaults')}
          </button>
        </div>
      </div>

      {!!settings.resize?.enabled && showResizeDetails && (
        <div className="pf-toolbar-panel">
          <ResizeControls />
        </div>
      )}

      {showAdvanced && (
        <div className="pf-toolbar-panel">
          <AdvancedControls />
        </div>
      )}

      {resetOpen && (
        <div
          className="pf-dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResetOpen(false);
          }}
        >
          <div
            className="pf-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pf-reset-title"
            aria-describedby="pf-reset-body"
          >
            <h2 className="pf-dialog-title" id="pf-reset-title">
              {t('dialog.resetTitle')}
            </h2>
            <p className="pf-dialog-copy" id="pf-reset-body">
              {t('dialog.resetBody')}
            </p>
            <div className="pf-dialog-actions">
              <button
                ref={cancelRef}
                type="button"
                className="pf-dialog-button pf-dialog-button-ghost"
                onClick={() => setResetOpen(false)}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="pf-dialog-button pf-dialog-button-primary"
                onClick={() => {
                  resetToDefaults();
                  setResetOpen(false);
                }}
              >
                {t('actions.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResizeControls() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resize = settings.resize ?? DEFAULT_RESIZE;
  const [draftPercentage, setDraftPercentage] = useState(resize.percentage ?? 50);

  useEffect(() => {
    setDraftPercentage(resize.percentage ?? 50);
  }, [resize.percentage]);

  const updateResize = (partial: Partial<ResizeSettings>) => {
    updateSettings({ resize: { ...resize, ...partial } });
  };

  const commitPercentage = (value: number) => {
    setDraftPercentage(value);
    updateResize({ percentage: value });
  };

  return (
    <div className="pf-resize-controls">
      <span className="pf-toolbar-panel-label">{t('settings.resizeSettings')}</span>

      <div className="pf-segmented" role="group" aria-label={t('settings.resizeSettings')}>
        <button
          type="button"
          className={`pf-segmented-button${resize.mode === 'absolute' ? ' is-active' : ''}`}
          onClick={() => updateResize({ mode: 'absolute' })}
        >
          {t('settings.absoluteMode')}
        </button>
        <button
          type="button"
          className={`pf-segmented-button${resize.mode === 'percentage' ? ' is-active' : ''}`}
          onClick={() => updateResize({ mode: 'percentage' })}
        >
          {t('settings.percentageMode')}
        </button>
      </div>

      {resize.mode === 'absolute' && (
        <div className="pf-dimensions">
          <input
            className="pf-toolbar-input"
            type="number"
            min={1}
            max={10000}
            value={resize.maxWidth ?? 1920}
            aria-label={t('settings.width')}
            onChange={(event) => {
              updateResize({
                maxWidth: parseBoundedNumber(event.target.value, 1920, 1, 10000),
              });
            }}
          />
          <span className="pf-dimension-separator">×</span>
          <input
            className="pf-toolbar-input"
            type="number"
            min={1}
            max={10000}
            value={resize.maxHeight ?? 1080}
            aria-label={t('settings.height')}
            onChange={(event) => {
              updateResize({
                maxHeight: parseBoundedNumber(event.target.value, 1080, 1, 10000),
              });
            }}
          />
        </div>
      )}

      {resize.mode === 'percentage' && (
        <div className="pf-percentage-control">
          <input
            className="pf-toolbar-range"
            type="range"
            min={1}
            max={100}
            step={1}
            value={draftPercentage}
            aria-label={t('settings.percentageMode')}
            style={getRangeProgressStyle(draftPercentage, 1, 100)}
            onChange={(event) => commitPercentage(Number(event.target.value))}
            onInput={(event) => commitPercentage(Number(event.currentTarget.value))}
          />
          <span className="pf-toolbar-value pf-toolbar-value-wide">{draftPercentage}%</span>
        </div>
      )}

      <label className="pf-fit-control">
        <span className="pf-toolbar-label">{t('settings.fitMethod')}</span>
        <select
          className="pf-toolbar-select pf-toolbar-fit-select"
          value={resize.method ?? 'contain'}
          onChange={(event) => updateResize({ method: event.target.value as ResizeMethod })}
        >
          <option value="contain">{t('settings.fit.contain')}</option>
          <option value="cover">{t('settings.fit.cover')}</option>
          <option value="stretch">{t('settings.fit.stretch')}</option>
        </select>
      </label>
    </div>
  );
}

function AdvancedControls() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const format = settings.outputFormat;
  const advanced = (settings.advanced ?? {}) as Record<string, unknown>;

  const updateAdvanced = (key: string, value: unknown) => {
    updateSettings({ advanced: { ...advanced, [key]: value } });
  };

  const boolValue = (key: string, fallback: boolean) =>
    typeof advanced[key] === 'boolean' ? (advanced[key] as boolean) : fallback;

  const numberValue = (key: string, fallback: number) =>
    typeof advanced[key] === 'number' ? (advanced[key] as number) : fallback;

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
            <select
              className="pf-toolbar-select pf-toolbar-select-compact"
              value={numberValue('chroma_subsample', 2)}
              onChange={(event) => updateAdvanced('chroma_subsample', Number(event.target.value))}
            >
              <option value={1}>4:4:4</option>
              <option value={2}>4:2:0</option>
            </select>
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
            <select
              className="pf-toolbar-select pf-toolbar-select-compact"
              value={numberValue('method', 4)}
              onChange={(event) => updateAdvanced('method', Number(event.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
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
            <select
              className="pf-toolbar-select pf-toolbar-select-compact"
              value={numberValue('speed', 6)}
              onChange={(event) => updateAdvanced('speed', Number(event.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Chip>
          <Chip label={t('settings.adv.subsample')} tooltip={t('tooltips.adv.subsample')}>
            <select
              className="pf-toolbar-select pf-toolbar-select-compact"
              value={numberValue('subsample', 1)}
              onChange={(event) => updateAdvanced('subsample', Number(event.target.value))}
            >
              <option value={0}>4:4:4</option>
              <option value={1}>4:2:0</option>
            </select>
          </Chip>
        </>
      )}
    </div>
  );
}
