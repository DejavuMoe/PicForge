import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FiArrowRight, FiChevronLeft, FiChevronRight, FiLock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { ProjectInfo } from '../components/ProjectInfo';
import sample from '../assets/dune-sample.jpg';
import preview from '../assets/dune-preview.webp';
import type { ToolId } from '../types';
import './landing.css';

const TOOLS = [
  { id: 'compression', formats: 'JPG · PNG · WebP · AVIF' },
  { id: 'android', formats: 'JPG → JPG + MP4' },
  { id: 'ios', formats: 'HEIC + MOV → JPG + MP4' },
] as const;

export default function Landing({ onSelect }: { onSelect: (tool: ToolId) => void }) {
  const { t } = useTranslation();
  const [position, setPosition] = useState(50);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
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
        <section className="pf-landing-hero">
          <div className="pf-landing-intro">
            <h1 id="pf-landing-title">
              <span>{t('entry.title')}</span>
              <span>{t('entry.titleAccent')}</span>
            </h1>
            <p className="pf-landing-summary">{t('entry.summary')}</p>
            <p className="pf-landing-privacy">
              <FiLock aria-hidden />
              {t('entry.privacy')}
            </p>
          </div>
          <figure className="pf-demo">
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
              <span className="pf-demo-divider" aria-hidden>
                <span>
                  <FiChevronLeft />
                  <FiChevronRight />
                </span>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={position}
                aria-label={t('entry.sampleCompare')}
                aria-valuetext={t('entry.samplePosition', { value: position })}
                onChange={(event) => setPosition(Number(event.target.value))}
              />
            </div>
            <figcaption>
              <span>JPEG</span>
              <button className="pf-text-button" disabled={loading} onClick={trySample}>
                {t(loading ? 'motion.loading' : 'entry.trySample')}
                <FiArrowRight aria-hidden />
              </button>
              <span>WebP</span>
            </figcaption>
            <p className="pf-demo-note" role={failed ? 'alert' : undefined}>
              {t(failed ? 'entry.sampleFailed' : 'entry.sampleNote')}
            </p>
          </figure>
        </section>
        <nav className="pf-entry-tools" aria-label={t('workbench.tools')}>
          {TOOLS.map(({ id, formats }, index) => {
            const url = new URL(window.location.href);
            url.searchParams.set('tool', id);
            return (
              <a
                key={id}
                className="pf-entry-tool"
                href={`${url.pathname}${url.search}${url.hash}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onSelect(id);
                }}
              >
                <span className="pf-entry-number" aria-hidden>
                  0{index + 1}
                </span>
                <strong>{t(`motion.${id}`)}</strong>
                <span className="pf-entry-description">{t(`entry.${id}`)}</span>
                <span className="pf-entry-formats">{formats}</span>
                <FiArrowRight className="pf-entry-arrow" aria-hidden />
              </a>
            );
          })}
        </nav>
        <div className="pf-landing-principles">
          {(['local', 'originals', 'ready'] as const).map((key) => (
            <div key={key}>
              <h2>{t(`entry.principles.${key}.title`)}</h2>
              <p>{t(`entry.principles.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="pf-landing-footer">
        <ProjectInfo variant="landing" />
      </footer>
    </div>
  );
}
