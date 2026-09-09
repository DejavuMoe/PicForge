import { ToolIcon } from '../components/ToolIcon';
import { useRef, type PointerEvent } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { ProjectInfo } from '../components/ProjectInfo';
import { OpticalLayer } from '../components/OpticalLayer';
import { ParticleRibbon } from './ParticleRibbon';
import heroLight from '../assets/optical-hero-light.webp';
import heroDark from '../assets/optical-hero-dark.webp';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import './landing.css';

const TOOLS = [{ id: 'compression' }, { id: 'android' }, { id: 'ios' }] as const;

export default function Landing({ onSelect }: { onSelect: (tool: ToolId) => void }) {
  const { t } = useTranslation();
  const { colorMode } = useThemeColors();
  const cursor = useRef<HTMLSpanElement>(null);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== 'mouse' ||
      !matchMedia('(pointer: fine)').matches ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLElement>('.pf-entry-tool');
    if (cursor.current) {
      cursor.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      cursor.current.dataset.active = link ? 'true' : 'false';
    }
    if (link) {
      const rect = link.getBoundingClientRect();
      link.style.setProperty('--light-x', `${event.clientX - rect.left}px`);
      link.style.setProperty('--light-y', `${event.clientY - rect.top}px`);
    }
  };
  return (
    <div
      className="pf-landing"
      onPointerMove={move}
      onPointerLeave={() => {
        if (cursor.current) cursor.current.dataset.active = 'false';
      }}
    >
      <span ref={cursor} className="pf-pointer-halo" aria-hidden="true" />
      <main className="pf-landing-main" aria-labelledby="pf-landing-title">
        <section className="pf-landing-hero">
          <div className="pf-landing-intro">
            <h1 id="pf-landing-title" tabIndex={-1}>
              {t('entry.title')
                .split('，')
                .map((part, index, parts) => (
                  <span key={part}>
                    {part}
                    {index < parts.length - 1 ? '，' : ''}
                  </span>
                ))}
            </h1>
            <p>
              {t('entry.summary')}
              <br />
              {t('entry.privacy')}
            </p>
          </div>
          <div className="pf-optical-scene" aria-hidden="true">
            <ParticleRibbon />
            <div className="pf-hero-art">
              <img
                className={colorMode === 'light' ? 'is-active' : ''}
                src={heroLight}
                alt=""
                width="1200"
                height="800"
                draggable="false"
              />
              <img
                className={colorMode === 'dark' ? 'is-active' : ''}
                src={heroDark}
                alt=""
                width="1200"
                height="800"
                draggable="false"
              />
            </div>
          </div>
        </section>
        <nav className="pf-entry-tools" aria-label={t('workbench.tools')}>
          {TOOLS.map(({ id }) => {
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
                <OpticalLayer />
                <span className="pf-entry-top">
                  <ToolIcon tool={id} className="pf-entry-icon" />
                  <strong>{t(`motion.${id}`)}</strong>
                  <FiArrowRight className="pf-entry-arrow" aria-hidden />
                </span>
                <span className="pf-entry-description">{t(`entry.${id}`)}</span>
              </a>
            );
          })}
        </nav>
      </main>
      <footer className="pf-landing-footer">
        <ProjectInfo variant="landing" />
      </footer>
    </div>
  );
}
