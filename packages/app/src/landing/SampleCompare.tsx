import { useState, type CSSProperties } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import sample from '../assets/dune-sample.jpg';
import preview from '../assets/dune-preview.webp';
import { TextButton } from '../components/ui/Button';
import { compressionRatio, formatFileSize, formatSizeChange } from '../utils/fileUtils';
import { SAMPLE_BYTES } from './sample';

/**
 * A real, pre-encoded pair on the graphite stage: the JPEG original on the left of the
 * split, its WebP encode on the right. Sizes are those of the bundled files.
 */
export function SampleCompare({
  loading,
  failed,
  onTry,
}: {
  loading: boolean;
  failed: boolean;
  onTry: () => void;
}) {
  const { t } = useTranslation();
  const [position, setPosition] = useState(50);
  const saving = compressionRatio(SAMPLE_BYTES.jpeg, SAMPLE_BYTES.webp);
  return (
    <figure className="pf-demo pf-stage-scope">
      <figcaption className="pf-demo-caption">
        <span className="pf-demo-side">
          <span className="pf-demo-format">JPEG</span>
          <span className="pf-mono">{formatFileSize(SAMPLE_BYTES.jpeg)}</span>
        </span>
        <span className="pf-demo-side is-right">
          <span className="pf-demo-format">WebP</span>
          <span className="pf-mono">{formatFileSize(SAMPLE_BYTES.webp)}</span>
          <span className="pf-mono pf-file-ratio">{formatSizeChange(saving)}</span>
        </span>
      </figcaption>
      <div className="pf-demo-image" style={{ '--split': `${position}%` } as CSSProperties}>
        <img
          src={preview}
          alt={t('entry.sampleAlt')}
          width="1200"
          height="800"
          fetchPriority="high"
        />
        <img
          className="pf-demo-original"
          src={sample}
          alt=""
          width="1200"
          height="800"
          decoding="async"
        />
        <input
          type="range"
          step="any"
          min="0"
          max="100"
          value={position}
          aria-label={t('entry.sampleCompare')}
          aria-valuetext={t('entry.samplePosition', { value: Math.round(position) })}
          onChange={(event) => setPosition(Number(event.target.value))}
        />
        <span className="pf-demo-divider" aria-hidden>
          <span />
        </span>
      </div>
      <div className="pf-demo-footer">
        <p className="pf-demo-note" role={failed ? 'alert' : undefined}>
          {t(failed ? 'entry.sampleFailed' : 'entry.sampleNote')}
        </p>
        <TextButton className="pf-demo-try" disabled={loading} onClick={onTry}>
          {t(loading ? 'motion.loading' : 'entry.trySample')}
          <FiArrowRight aria-hidden />
        </TextButton>
      </div>
    </figure>
  );
}
