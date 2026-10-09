import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AVIF_CHROMA_SUBSAMPLE } from '@pic-forge/codecs';
import { Select } from '../../../components/ui/Select';
import { Switch } from '../../../components/ui/Switch';
import type { SettingsFieldsProps } from './SettingsFields';

/** Codec options of the active format only; `advanced` is normalised to the same keys. */
export function AdvancedControls({ settings, updateSettings }: SettingsFieldsProps) {
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
    <div className="pf-option-rows pf-advanced-controls">
      {format === 'mozjpeg' && (
        <>
          <OptionRow label={t('settings.adv.progressive')} hint={t('tooltips.adv.progressive')}>
            <Switch
              checked={boolValue('progressive', true)}
              label={t('settings.adv.progressive')}
              onChange={(checked) => updateAdvanced('progressive', checked)}
            />
          </OptionRow>
          <OptionRow
            label={t('settings.adv.chromaSubsample')}
            hint={t('tooltips.adv.chromaSubsample')}
          >
            <Select
              className="pf-option-select"
              aria-label={t('settings.adv.chromaSubsample')}
              value={numberValue('chroma_subsample', 2)}
              onValueChange={(value) => updateAdvanced('chroma_subsample', Number(value))}
            >
              <option value={1}>4:4:4</option>
              <option value={2}>4:2:0</option>
            </Select>
          </OptionRow>
          <OptionRow label={t('settings.adv.trellis')} hint={t('tooltips.adv.trellis')}>
            <Switch
              checked={boolValue('trellis_multipass', false)}
              label={t('settings.adv.trellis')}
              onChange={(checked) => updateAdvanced('trellis_multipass', checked)}
            />
          </OptionRow>
        </>
      )}

      {format === 'webp' && (
        <>
          <OptionRow label={t('settings.adv.lossless')} hint={t('tooltips.adv.lossless')}>
            <Switch
              checked={advanced.lossless === 1}
              label={t('settings.adv.lossless')}
              onChange={(checked) => updateAdvanced('lossless', checked ? 1 : 0)}
            />
          </OptionRow>
          <OptionRow label={t('settings.adv.method')} hint={t('tooltips.adv.method')}>
            <Select
              className="pf-option-select"
              aria-label={t('settings.adv.method')}
              value={numberValue('method', 4)}
              onValueChange={(value) => updateAdvanced('method', Number(value))}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </OptionRow>
          <OptionRow
            label={t('settings.adv.alphaCompression')}
            hint={t('tooltips.adv.alphaCompression')}
          >
            <Switch
              checked={numberValue('alpha_compression', 1) === 1}
              label={t('settings.adv.alphaCompression')}
              onChange={(checked) => updateAdvanced('alpha_compression', checked ? 1 : 0)}
            />
          </OptionRow>
        </>
      )}

      {format === 'oxipng' && (
        <OptionRow label={t('settings.adv.interlace')} hint={t('tooltips.adv.interlace')}>
          <Switch
            checked={boolValue('interlace', false)}
            label={t('settings.adv.interlace')}
            onChange={(checked) => updateAdvanced('interlace', checked)}
          />
        </OptionRow>
      )}

      {format === 'avif' && (
        <>
          <OptionRow label={t('settings.adv.speed')} hint={t('tooltips.adv.speed')}>
            <Select
              className="pf-option-select"
              aria-label={t('settings.adv.speed')}
              value={numberValue('speed', 6)}
              onValueChange={(value) => updateAdvanced('speed', Number(value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </OptionRow>
          <OptionRow label={t('settings.adv.subsample')} hint={t('tooltips.adv.subsample')}>
            <Select
              className="pf-option-select"
              aria-label={t('settings.adv.subsample')}
              value={avifSubsampleValue(numberValue('subsample', AVIF_CHROMA_SUBSAMPLE.YUV420))}
              onValueChange={(value) => updateAdvanced('subsample', Number(value))}
            >
              <option value={AVIF_CHROMA_SUBSAMPLE.YUV444}>4:4:4</option>
              <option value={AVIF_CHROMA_SUBSAMPLE.YUV420}>4:2:0</option>
            </Select>
          </OptionRow>
        </>
      )}
    </div>
  );
}

/** Label and explanation on the left, the control on the right. */
function OptionRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="pf-option-row">
      <span className="pf-option-row-text">
        <span className="pf-option-row-label">{label}</span>
        <span className="pf-option-row-hint">{hint}</span>
      </span>
      {children}
    </div>
  );
}
