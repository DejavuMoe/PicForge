import { useEffect, useRef, useState } from 'react';
import { FiGithub, FiGlobe, FiMoon, FiSun } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { SUPPORTED_LANGUAGES } from '../i18n';

const SHORT_LANG: Record<string, string> = {
  en: 'EN',
  'zh-CN': '中',
  'zh-TW': '繁',
  ja: 'JP',
  ko: 'KR',
};

export function Header() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  const currentLang =
    SUPPORTED_LANGUAGES.find((language) => language.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!isLanguageOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLanguageOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLanguageOpen]);

  return (
    <header className="pf-header">
      <a href="/" className="pf-brand-link">
        <span className="pf-brand">
          <span className="pf-logo">P</span>
          <span className="pf-brand-title">{t('app.title')}</span>
          <span className="pf-brand-subtitle">{t('app.subtitle')}</span>
        </span>
      </a>

      <div className="pf-header-spacer" />

      <div className="pf-header-actions">
        <div className="pf-header-menu-wrap" ref={languageMenuRef}>
          <button
            type="button"
            className="pf-header-button"
            aria-haspopup="menu"
            aria-expanded={isLanguageOpen}
            onClick={() => setIsLanguageOpen((open) => !open)}
          >
            <FiGlobe className="pf-icon" aria-hidden="true" />
            <span className="pf-language-full">{currentLang.label}</span>
            <span className="pf-language-short">{SHORT_LANG[i18n.language] ?? 'EN'}</span>
          </button>

          {isLanguageOpen && (
            <div className="pf-language-menu" role="menu">
              {SUPPORTED_LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className={`pf-language-item${language.code === i18n.language ? ' is-active' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    i18n.changeLanguage(language.code);
                    setIsLanguageOpen(false);
                  }}
                >
                  {language.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <a
          href="https://github.com/DejavuMoe/PicForge"
          className="pf-icon-button"
          aria-label={t('tooltips.github')}
          target="_blank"
          rel="noreferrer"
        >
          <FiGithub className="pf-icon" aria-hidden="true" />
        </a>

        <button
          type="button"
          className="pf-icon-button"
          aria-label={t('tooltips.toggleColorMode')}
          onClick={c.toggleColorMode}
        >
          {c.colorMode === 'light' ? (
            <FiMoon className="pf-icon" aria-hidden="true" />
          ) : (
            <FiSun className="pf-icon" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
