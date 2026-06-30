import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompressSettings, OutputFormat, ResizeMethod } from '@pic-forge/codecs';
import { FORMAT_OPTIONS, type ImageFile } from '../types';
import { useFileStore } from '../stores/fileStore';
import { getRangeProgressStyle } from '../utils/rangeProgress';

interface FileSettingsPanelProps {
  file: ImageFile;
}

type ResizeSettings = NonNullable<CompressSettings['resize']>;

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

export function FileSettingsPanel({ file }: FileSettingsPanelProps) {
  const { t } = useTranslation();
  const updateFileCustomSettings = useFileStore((s) => s.updateFileCustomSettings);
  const settings = file.customSettings;
  const resize = settings?.resize;
  const [draftQuality, setDraftQuality] = useState(settings?.quality ?? 75);
  const [draftPercentage, setDraftPercentage] = useState(resize?.percentage ?? 50);

  useEffect(() => {
    setDraftQuality(settings?.quality ?? 75);
  }, [settings?.quality]);

  useEffect(() => {
    setDraftPercentage(resize?.percentage ?? 50);
  }, [resize?.percentage]);

  if (!settings || !resize) return null;

  const updateSettings = (partial: Partial<CompressSettings>) => {
    updateFileCustomSettings(file.id, partial);
  };

  const updateResize = (partial: Partial<ResizeSettings>) => {
    updateSettings({ resize: { ...resize, ...partial } });
  };

  const commitQuality = (value: number) => {
    setDraftQuality(value);
    updateSettings({ quality: value });
  };

  const commitPercentage = (value: number) => {
    setDraftPercentage(value);
    updateResize({ percentage: value });
  };

  return (
    <div className="pf-file-settings-panel">
      <div className="pf-file-settings-controls">
        <span className="pf-toolbar-panel-label">{t('settings.customImageSettings')}</span>

        <select
          className="pf-toolbar-select pf-file-settings-format"
          value={settings.outputFormat}
          onChange={(event) => updateSettings({ outputFormat: event.target.value as OutputFormat })}
        >
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="pf-file-settings-quality">
          <span className="pf-toolbar-label">{t('settings.quality')}</span>
          <input
            className="pf-toolbar-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftQuality}
            style={getRangeProgressStyle(draftQuality, 0, 100)}
            onChange={(event) => commitQuality(Number(event.target.value))}
            onInput={(event) => commitQuality(Number(event.currentTarget.value))}
          />
          <span className="pf-toolbar-value">{draftQuality}</span>
        </label>

        <label className="pf-toolbar-switch-label">
          <span>{t('settings.resize')}</span>
          <SwitchControl
            checked={resize.enabled}
            ariaLabel={t('settings.resize')}
            onChange={(checked) => updateResize({ enabled: checked })}
          />
        </label>

        {resize.enabled && (
          <>
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

            <select
              className="pf-toolbar-select pf-toolbar-fit-select"
              value={resize.method ?? 'contain'}
              onChange={(event) => updateResize({ method: event.target.value as ResizeMethod })}
            >
              <option value="contain">{t('settings.fit.contain')}</option>
              <option value="cover">{t('settings.fit.cover')}</option>
              <option value="stretch">{t('settings.fit.stretch')}</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}
