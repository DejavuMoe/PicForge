import { useTranslation } from 'react-i18next';
import type { CompressSettings, OutputFormat, ResizeMethod } from '@pic-forge/codecs';
import { NumberField } from '../../../components/ui/NumberField';
import { RangeField } from '../../../components/ui/RangeField';
import { RadioRail, Segmented } from '../../../components/ui/Segmented';
import { Select } from '../../../components/ui/Select';
import { Switch } from '../../../components/ui/Switch';
import { FORMAT_OPTIONS } from '../../../types';
import { AdvancedControls } from './AdvancedControls';

export interface SettingsFieldsProps {
  settings: CompressSettings;
  updateSettings: (partial: Partial<CompressSettings>) => void;
}

const DEFAULT_RESIZE: NonNullable<CompressSettings['resize']> = {
  enabled: false,
  mode: 'absolute',
  maxWidth: 1920,
  maxHeight: 1080,
  percentage: 50,
  method: 'contain',
};

export function SettingsFields({ settings, updateSettings }: SettingsFieldsProps) {
  const { t } = useTranslation();
  const resize = settings.resize ?? DEFAULT_RESIZE;
  const lossless = settings.outputFormat === 'oxipng';
  const updateResize = (partial: Partial<typeof resize>) =>
    updateSettings({ resize: { ...resize, ...partial } });
  return (
    <div className="pf-settings-fields" data-testid="toolbar">
      <div className="pf-field">
        <span className="pf-field-label" aria-hidden>
          {t('workbench.format')}
        </span>
        <RadioRail
          label={t('workbench.format')}
          value={settings.outputFormat}
          options={FORMAT_OPTIONS}
          onChange={(value) => updateSettings({ outputFormat: value as OutputFormat })}
        />
        <p className="pf-field-hint pf-format-note">
          {t(`workbench.formatNotes.${settings.outputFormat}`)}
        </p>
      </div>
      <div className="pf-field">
        <label className="pf-field-label" htmlFor="pf-global-quality">
          {t('settings.quality')}
        </label>
        <RangeField
          id="pf-global-quality"
          disabled={lossless}
          min={0}
          max={100}
          value={settings.quality}
          label={t('settings.quality')}
          valueLabel={t('workbench.qualityValue')}
          onChange={(quality) => updateSettings({ quality })}
        />
        {lossless && <p className="pf-quality-hint">{t('workbench.losslessHint')}</p>}
      </div>
      <section className="pf-settings-section">
        <div className="pf-field-heading">
          <span>{t('settings.resize')}</span>
          <Switch
            checked={resize.enabled}
            label={t('settings.resize')}
            onChange={(enabled) => updateResize({ enabled })}
          />
        </div>
        <fieldset
          hidden={!resize.enabled}
          disabled={!resize.enabled}
          className="pf-resize-controls"
        >
          {resize.mode === 'absolute' ? (
            <div className="pf-dimensions">
              <label className="pf-field">
                <span>
                  {t(resize.method === 'contain' ? 'workbench.maxWidth' : 'settings.width')}
                </span>
                <span className="pf-unit-input">
                  <NumberField
                    min={1}
                    max={10000}
                    value={resize.maxWidth}
                    aria-label={t('settings.width')}
                    onValueChange={(maxWidth) => updateResize({ maxWidth })}
                  />
                  <span aria-hidden="true">px</span>
                </span>
              </label>
              <span className="pf-dimensions-times" aria-hidden>
                ×
              </span>
              <label className="pf-field">
                <span>
                  {t(resize.method === 'contain' ? 'workbench.maxHeight' : 'settings.height')}
                </span>
                <span className="pf-unit-input">
                  <NumberField
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
            <div className="pf-field">
              <span>{t('settings.percentageMode')}</span>
              <RangeField
                min={1}
                max={100}
                value={resize.percentage}
                label={t('settings.percentageMode')}
                valueLabel={t('settings.percentageMode')}
                onChange={(percentage) => updateResize({ percentage })}
              />
            </div>
          )}
          <label className="pf-field">
            <span>{t('settings.fitMethod')}</span>
            <Select
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
            </Select>
          </label>
        </fieldset>
        {resize.enabled && resize.method === 'contain' && (
          <p className="pf-field-hint">{t('workbench.containHint')}</p>
        )}
      </section>
      <details className="pf-disclosure pf-settings-extra">
        <summary>{t('settings.advancedTitle')}</summary>
        <fieldset disabled={!resize.enabled} className="pf-resize-mode-setting">
          <legend className="pf-field-label">{t('settings.resizeSettings')}</legend>
          <Segmented
            label={t('settings.resizeSettings')}
            value={resize.mode}
            options={[
              { value: 'absolute', label: t('settings.absoluteMode') },
              { value: 'percentage', label: t('settings.percentageMode') },
            ]}
            onChange={(mode) => updateResize({ mode: mode as 'absolute' | 'percentage' })}
          />
        </fieldset>
        <AdvancedControls settings={settings} updateSettings={updateSettings} />
      </details>
    </div>
  );
}
