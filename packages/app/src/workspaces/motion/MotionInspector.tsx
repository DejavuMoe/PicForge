import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RangeField } from '../../components/ui/RangeField';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { Inspector } from '../../components/workbench/Inspector';
import type { MotionSettings } from '../../motion/media';

const PRESETS = ['balanced', 'quality', 'compact'] as const;

export function MotionInspector({
  android,
  settings,
  onSettings,
  locked,
  busy,
  notice,
  batchMegabytes,
  footer,
}: {
  android: boolean;
  settings: MotionSettings;
  onSettings: (settings: MotionSettings) => void;
  locked: boolean;
  busy: boolean;
  notice: string;
  batchMegabytes: number;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Inspector
      title={t(android ? 'workbench.outputFiles' : 'workbench.conversionSettings')}
      footer={footer}
    >
      {android ? (
        <section className="pf-inspector-section">
          <h3 className="pf-section-title">{t('workbench.originalBytes')}</h3>
          <p className="pf-field-hint">{t('motion.androidNote')}</p>
          <p className="pf-tag-list">
            <span className="pf-tag">JPG</span>
            <span aria-hidden>→</span>
            <span className="pf-tag">JPG</span>
            <span className="pf-tag">MP4</span>
          </p>
        </section>
      ) : (
        <>
          <fieldset className="pf-settings-fields" disabled={locked}>
            <label className="pf-field">
              <span>{t('motion.preset')}</span>
              <Select
                value={settings.preset}
                aria-label={t('motion.preset')}
                disabled={locked}
                onValueChange={(value) =>
                  onSettings({ ...settings, preset: value as MotionSettings['preset'] })
                }
              >
                {PRESETS.map((value) => (
                  <option value={value} key={value}>
                    {t(`motion.${value}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="pf-field">
              <span>{t('motion.fps')}</span>
              <Select
                value={settings.fps}
                aria-label={t('motion.fps')}
                disabled={locked}
                onValueChange={(value) =>
                  onSettings({ ...settings, fps: value as MotionSettings['fps'] })
                }
              >
                <option value="source">{t('motion.sourceFps')}</option>
                <option value="30">30 fps</option>
              </Select>
            </label>
            <div className="pf-field">
              <span>{t('motion.jpegQuality')}</span>
              <RangeField
                min={60}
                max={95}
                value={settings.quality}
                label={t('motion.jpegQuality')}
                valueLabel={t('workbench.qualityValue')}
                onChange={(quality) => onSettings({ ...settings, quality })}
              />
            </div>
            <div className="pf-field-heading">
              <span>{t('motion.audio')}</span>
              <Switch
                checked={settings.audio}
                label={t('motion.audio')}
                onChange={(audio) => onSettings({ ...settings, audio })}
              />
            </div>
          </fieldset>
          <details className="pf-disclosure pf-settings-extra">
            <summary>{t('workbench.pairingHelp')}</summary>
            <p className="pf-motion-note">{t('motion.pairing')}</p>
            <p className="pf-motion-note">{t('motion.iosNote')}</p>
            <p className="pf-motion-note">{t('motion.offline')}</p>
          </details>
        </>
      )}
      {locked && !busy && <p className="pf-motion-note pf-locked-note">{t('motion.lockedHint')}</p>}
      {notice && (
        <p className="pf-field-error" role="alert">
          {t(`motion.errors.${notice}`, { maxMB: batchMegabytes })}
        </p>
      )}
    </Inspector>
  );
}
