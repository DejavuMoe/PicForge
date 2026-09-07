import { useEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  FiArrowDown,
  FiArrowRight,
  FiCpu,
  FiFilm,
  FiGithub,
  FiImage,
  FiShield,
  FiSmartphone,
  FiUnlock,
  FiWifiOff,
} from 'react-icons/fi';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import { ParticleField } from './ParticleField';
import './landing.css';

type LandingTool = Exclude<ToolId, 'home'>;

const TOOL_ICONS: Record<LandingTool, typeof FiImage> = {
  compression: FiImage,
  android: FiSmartphone,
  ios: FiFilm,
};

const FEATURES = [
  { key: 'local', icon: FiShield },
  { key: 'wasm', icon: FiCpu },
  { key: 'offline', icon: FiWifiOff },
  { key: 'open', icon: FiUnlock },
] as const;

const TOOLS: LandingTool[] = ['compression', 'android', 'ios'];

/**
 * Landing page: WebGL particle hero, tool cards and privacy highlights.
 * Purely presentational — tools are opened through the shared navigation.
 */
export function Landing({ onSelect }: { onSelect: (tool: LandingTool) => void }) {
  const { t } = useTranslation();
  const { colorMode, accent } = useThemeColors();
  const rootRef = useRef<HTMLDivElement>(null);

  const scrollToTools = () => {
    // .pf-landing has scroll-behavior: smooth (auto under reduced motion).
    rootRef.current?.querySelector('#pf-tools')?.scrollIntoView({ block: 'start' });
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const items = Array.from(root.querySelectorAll('.pf-reveal'));
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      items.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pf-landing" ref={rootRef}>
      <section className="pf-hero">
        <ParticleField colorMode={colorMode} accent={accent} />
        <div className="pf-hero-aurora" aria-hidden="true" />
        <div className="pf-hero-inner">
          <p className="pf-hero-eyebrow pf-anim" style={{ '--d': '0ms' } as React.CSSProperties}>
            {t('landing.eyebrow')}
          </p>
          <h1 className="pf-hero-title">
            <span className="pf-anim" style={{ '--d': '70ms' } as React.CSSProperties}>
              {t('landing.heroTitleA')}
            </span>
            <span
              className="pf-anim pf-hero-title-accent"
              style={{ '--d': '150ms' } as React.CSSProperties}
            >
              {t('landing.heroTitleB')}
            </span>
          </h1>
          <p className="pf-hero-body pf-anim" style={{ '--d': '230ms' } as React.CSSProperties}>
            {t('landing.heroBody')}
          </p>
          <div
            className="pf-hero-actions pf-anim"
            style={{ '--d': '310ms' } as React.CSSProperties}
          >
            <button type="button" className="pf-hero-cta" onClick={scrollToTools}>
              {t('landing.ctaPrimary')}
              <FiArrowDown aria-hidden="true" />
            </button>
            <a
              className="pf-hero-ghost"
              href="https://github.com/DejavuMoe/PicForge"
              target="_blank"
              rel="noreferrer"
            >
              <FiGithub aria-hidden="true" />
              {t('landing.ctaSecondary')}
            </a>
          </div>
        </div>
      </section>

      <section className="pf-landing-section" id="pf-tools" aria-labelledby="pf-tools-title">
        <header className="pf-section-head pf-reveal">
          <p className="pf-section-eyebrow">{t('landing.toolsEyebrow')}</p>
          <h2 id="pf-tools-title">{t('landing.toolsTitle')}</h2>
          <p>{t('landing.toolsBody')}</p>
        </header>
        <div className="pf-tool-cards">
          {TOOLS.map((tool, index) => {
            const Icon = TOOL_ICONS[tool];
            const title = t(`landing.cards.${tool}.title`);
            return (
              <button
                key={tool}
                type="button"
                className="pf-tool-card pf-reveal"
                style={{ '--d': `${index * 90}ms` } as React.CSSProperties}
                aria-label={title}
                onClick={() => onSelect(tool)}
              >
                <span className="pf-tool-card-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="pf-tool-card-title">{title}</span>
                <span className="pf-tool-card-body">{t(`landing.cards.${tool}.body`)}</span>
                <span className="pf-tool-card-foot">
                  <span className="pf-tool-card-meta">{t(`landing.cards.${tool}.meta`)}</span>
                  <FiArrowRight className="pf-tool-card-arrow" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-landing-section" aria-labelledby="pf-features-title">
        <header className="pf-section-head pf-reveal">
          <p className="pf-section-eyebrow">{t('landing.featuresEyebrow')}</p>
          <h2 id="pf-features-title">{t('landing.featuresTitle')}</h2>
        </header>
        <div className="pf-feature-grid">
          {FEATURES.map(({ key, icon: Icon }, index) => (
            <article
              key={key}
              className="pf-feature pf-reveal"
              style={{ '--d': `${index * 70}ms` } as React.CSSProperties}
            >
              <span className="pf-feature-icon" aria-hidden="true">
                <Icon />
              </span>
              <h3>{t(`landing.features.${key}.title`)}</h3>
              <p>{t(`landing.features.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="pf-landing-footer">
        <span className="pf-landing-footer-copy">
          © {new Date().getFullYear()}{' '}
          <a href="https://blog.dejavu.moe" target="_blank" rel="noreferrer">
            DejavuMoe
          </a>{' '}
          · MIT License
        </span>
        <span className="pf-landing-footer-sponsor">
          <Trans
            i18nKey="landing.sponsor"
            components={{
              sponsor: (
                <a
                  href="https://sa.net/?ref=https://picforge.de"
                  target="_blank"
                  rel="noreferrer"
                />
              ),
            }}
          />
        </span>
      </footer>
    </div>
  );
}
