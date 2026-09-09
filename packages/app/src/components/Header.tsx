import { BrandMark } from './BrandMark';
import { useEffect, useRef } from 'react';
import { FiMoon, FiSun, FiMoreHorizontal, FiGithub } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import { SUPPORTED_LANGUAGES, chooseLanguage } from '../i18n';
import { SelectControl } from './SelectControl';

const TOOLS = ['compression', 'android', 'ios'] as const;
export function Header({
  onHome,
  tool,
  onSelect,
}: {
  onHome: () => void;
  tool: ToolId;
  onSelect: (tool: ToolId) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useThemeColors();
  const currentLanguage = i18n.resolvedLanguage ?? 'en';
  const selectLanguage = (value: string) => void chooseLanguage(value);
  const preferences = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.pf-select-menu')) return;
      if (preferences.current?.open && !preferences.current.contains(event.target as Node))
        preferences.current.open = false;
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, []);
  return (
    <header className="pf-header">
      <button
        type="button"
        className="pf-brand-button"
        onClick={onHome}
        aria-label={t('entry.home')}
      >
        <BrandMark />
        <span className="pf-brand-copy">
          <span className="pf-brand-title">PicForge</span>
        </span>
      </button>
      {tool !== 'home' && (
        <>
          <nav className="pf-tool-nav" aria-label={t('workbench.tools')}>
            {TOOLS.map((value) => (
              <button
                type="button"
                key={value}
                aria-current={tool === value ? 'page' : undefined}
                onClick={() => onSelect(value)}
              >
                {t(`nav.${value}`)}
              </button>
            ))}
          </nav>
          <div className="pf-mobile-tool">
            <SelectControl
              aria-label={t('workbench.tools')}
              value={tool}
              onValueChange={(value) => onSelect(value as ToolId)}
            >
              {TOOLS.map((value) => (
                <option key={value} value={value}>
                  {t(`nav.${value}`)}
                </option>
              ))}
            </SelectControl>
          </div>
        </>
      )}
      <div className="pf-header-actions">
        <a
          className="pf-icon-button pf-github-link"
          href="https://github.com/DejavuMoe/PicForge"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          data-tooltip="GitHub"
        >
          <FiGithub aria-hidden />
        </a>
        <div className="pf-language-control">
          <LanguageSelect language={currentLanguage} onSelect={selectLanguage} />
        </div>
        <button
          type="button"
          className="pf-icon-button pf-theme-button"
          data-tooltip={t('tooltips.toggleColorMode')}
          aria-label={t('tooltips.toggleColorMode')}
          onClick={theme.toggleColorMode}
        >
          {theme.colorMode === 'dark' ? <FiSun aria-hidden /> : <FiMoon aria-hidden />}
        </button>
        <details
          ref={preferences}
          className="pf-about"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
        >
          <summary className="pf-icon-button" aria-label={t('workbench.preferences')}>
            <FiMoreHorizontal aria-hidden />
          </summary>
          <div className="pf-about-menu">
            <strong>{t('workbench.preferences')}</strong>
            <div className="pf-mobile-preferences">
              <LanguageSelect language={currentLanguage} onSelect={selectLanguage} />
              <button className="pf-text-button" onClick={theme.toggleColorMode}>
                {theme.colorMode === 'light' ? <FiMoon aria-hidden /> : <FiSun aria-hidden />}
                {t('tooltips.toggleColorMode')}
              </button>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

function LanguageSelect({
  language,
  onSelect,
}: {
  language: string;
  onSelect: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SelectControl aria-label={t('workbench.language')} value={language} onValueChange={onSelect}>
      {SUPPORTED_LANGUAGES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </SelectControl>
  );
}
