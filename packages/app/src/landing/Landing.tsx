import { useEffect, useRef, useState } from 'react';
import { FiLock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import sample from '../assets/dune-sample.jpg';
import type { ToolId } from '../types';
import { SampleCompare } from './SampleCompare';
import { ToolIndex } from './ToolIndex';
import './landing.css';

export default function Landing({ onSelect }: { onSelect: (tool: ToolId) => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  // The sample opens in the real compressor, as an ordinary local file.
  const trySample = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const [response, { useFileStore }] = await Promise.all([
        fetch(sample, { signal: controller.signal }),
        import('../stores/fileStore'),
      ]);
      if (!response.ok) throw new Error('Sample unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      useFileStore
        .getState()
        .addFiles([new File([blob], 'dune-sample.jpg', { type: 'image/jpeg' })]);
      onSelect('compression');
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  return (
    <div className="pf-landing">
      <main
        className="pf-landing-main"
        id="pf-main"
        tabIndex={-1}
        aria-labelledby="pf-landing-title"
      >
        <div className="pf-landing-intro">
          <h1 id="pf-landing-title">{t('entry.title')}</h1>
          <p className="pf-landing-summary">{t('entry.summary')}</p>
          <p className="pf-landing-privacy">
            <FiLock aria-hidden />
            {t('entry.privacy')}
          </p>
        </div>
        <ToolIndex onSelect={onSelect} />
        <SampleCompare loading={loading} failed={failed} onTry={() => void trySample()} />
      </main>
    </div>
  );
}
