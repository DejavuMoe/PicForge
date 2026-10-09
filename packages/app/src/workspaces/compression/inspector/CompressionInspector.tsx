import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompressSettings } from '@pic-forge/codecs';
import { TextButton } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Segmented } from '../../../components/ui/Segmented';
import { Inspector } from '../../../components/workbench/Inspector';
import { useFileStore } from '../../../stores/fileStore';
import { PRESETS, type Preset } from '../../../stores/presets';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { ImageFile } from '../../../types';
import { applyPresetSettings, cloneSettings } from '../../../utils/settingsUtils';
import { ResultSummary } from './ResultSummary';
import { SettingsFields } from './SettingsFields';

/** A preset is current when format, quality and its own advanced options all match. */
function matchesPreset(settings: CompressSettings, preset: Preset) {
  const advanced = (settings.advanced ?? {}) as Record<string, unknown>;
  return (
    settings.outputFormat === preset.settings.outputFormat &&
    settings.quality === preset.settings.quality &&
    Object.entries(preset.settings.advanced ?? {}).every(([key, value]) => advanced[key] === value)
  );
}

/** One inspector for global settings and complete per-file snapshots. */
export function CompressionInspector({ file }: { file: ImageFile | null }) {
  const { t } = useTranslation();
  const global = useSettingsStore((state) => state.settings);
  const updateGlobal = useSettingsStore((state) => state.updateSettings);
  const replaceGlobal = useSettingsStore((state) => state.replaceSettings);
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
  const applyPreset = (preset: Preset) => {
    const next = applyPresetSettings(settings, preset.settings);
    if (scope === 'file' && file) useFileStore.getState().setFileCustomSettings(file.id, next);
    else replaceGlobal(next);
  };
  const chooseFile = () => {
    if (!file) return;
    if (file.settingsMode !== 'custom')
      useFileStore.getState().setFileCustomSettings(file.id, cloneSettings(global));
    setScope('file');
  };
  return (
    <Inspector title={t('workbench.outputSettings')} footer={file && <ResultSummary file={file} />}>
      <section className="pf-inspector-section">
        <Segmented
          className="pf-scope-switch"
          label={t('workbench.settingsScope')}
          value={scope}
          options={[
            { value: 'global', label: t('workbench.allImages') },
            { value: 'file', label: t('workbench.thisImage'), disabled: !file },
          ]}
          onChange={(value) => (value === 'file' ? chooseFile() : setScope('global'))}
        />
        {hasCustomFiles && scope === 'global' && (
          <p className="pf-field-hint">{t('workbench.globalHint')}</p>
        )}
        {scope === 'file' && file && (
          <div className="pf-scope-note">
            <p>{t('workbench.customHint')}</p>
            <TextButton onClick={() => useFileStore.getState().resetFileToGlobal(file.id, global)}>
              {t('actions.useGlobalSettings')}
            </TextButton>
          </div>
        )}
      </section>
      <section className="pf-presets" aria-labelledby="pf-presets-title">
        <div className="pf-presets-heading">
          <h3 id="pf-presets-title" className="pf-section-title">
            {t('settings.title')}
          </h3>
          {scope === 'global' && (
            <TextButton
              onClick={(event) => {
                event.currentTarget.focus();
                setResetOpen(true);
              }}
            >
              {t('actions.resetDefaults')}
            </TextButton>
          )}
        </div>
        <div className="pf-preset-list">
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="pf-preset"
              aria-current={matchesPreset(settings, preset) ? 'true' : undefined}
              onClick={() => applyPreset(preset)}
            >
              <strong>{t(preset.labelKey)}</strong>
              <span>{t(preset.descriptionKey)}</span>
            </button>
          ))}
        </div>
      </section>
      <SettingsFields settings={settings} updateSettings={updateSettings} />
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
