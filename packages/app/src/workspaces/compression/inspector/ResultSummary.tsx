import type { CSSProperties } from 'react';
import { FiDownload } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { useSettingsStore } from '../../../stores/settingsStore';
import { FORMAT_OPTIONS, type ImageFile } from '../../../types';
import { getOutputName, isResultExportable } from '../../../utils/exportManifest';
import { compressionRatio, formatFileSize } from '../../../utils/fileUtils';
import { getEffectiveSettings } from '../../../utils/settingsUtils';

const SOURCE_FORMATS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/apng': 'APNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/svg+xml': 'SVG',
};
function sourceFormat(file: File) {
  return SOURCE_FORMATS[file.type] ?? file.name.split('.').pop()?.toUpperCase() ?? '';
}

/** Source → result ledger for the selected image, and its download. */
export function ResultSummary({ file }: { file: ImageFile }) {
  const { t } = useTranslation();
  const global = useSettingsStore((state) => state.settings);
  const exportable = isResultExportable(file, global);
  const saving = exportable ? compressionRatio(file.originalSize, file.result!.size) : 0;
  const outputLabel = FORMAT_OPTIONS.find(
    (option) => option.value === getEffectiveSettings(file, global).outputFormat,
  )?.label;
  const meta = file.outputMeta;
  const download = async () => {
    if (!isResultExportable(file, global)) return;
    const { saveAs } = await import('file-saver');
    saveAs(file.result!.blob, getOutputName(file, global));
  };
  return (
    <>
      <dl className="pf-result-ledger">
        <div>
          <dt>{t('workbench.original')}</dt>
          <dd>
            {sourceFormat(file.file)}
            {meta && ` · ${meta.originalWidth}×${meta.originalHeight}`}
          </dd>
          <dd>{formatFileSize(file.originalSize)}</dd>
        </div>
        <div>
          <dt>{t('workbench.result')}</dt>
          <dd>
            {exportable && outputLabel}
            {exportable && meta && ` · ${meta.outputWidth}×${meta.outputHeight}`}
          </dd>
          <dd>{exportable ? formatFileSize(file.result!.size) : '—'}</dd>
        </div>
      </dl>
      <div className="pf-result-delta">
        <span
          className={cx('pf-file-delta', saving < 0 && 'is-larger')}
          style={
            {
              '--pf-delta': exportable
                ? Math.min(1, file.result!.size / Math.max(1, file.originalSize))
                : 0,
            } as CSSProperties
          }
          aria-hidden
        />
        <p
          className={cx(
            'pf-result-saving',
            !exportable ? 'is-pending' : saving < 0 ? 'is-larger' : undefined,
          )}
        >
          {!exportable
            ? t('workbench.notReady')
            : saving === 0
              ? t('progress.noChange')
              : t(saving > 0 ? 'workbench.smaller' : 'workbench.larger', {
                  percent: Math.abs(saving),
                })}
        </p>
      </div>
      <Button
        block
        size="lg"
        className="pf-download-current"
        icon={<FiDownload aria-hidden />}
        disabled={!exportable}
        onClick={download}
      >
        {t('workbench.downloadCurrent')}
      </Button>
    </>
  );
}
