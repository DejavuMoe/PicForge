import { BrandMark } from './BrandMark';
import { useEffect, useRef, useState } from 'react';
import { FiMoon, FiSun, FiMoreHorizontal } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import { SUPPORTED_LANGUAGES, chooseLanguage } from '../i18n';
import { getLanguagePreference } from '../i18n/languagePreference';
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
  const [languagePreference, setLanguagePreference] = useState<string>(getLanguagePreference);
  const currentLanguage =
    SUPPORTED_LANGUAGES.find((language) => language.code === i18n.resolvedLanguage)?.label ??
    'English';
  const selectLanguage = (value: string) => {
    setLanguagePreference(value);
    void chooseLanguage(value);
  };
  const preferences = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
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
        <div className="pf-language-control">
          <LanguageSelect
            preference={languagePreference}
            language={currentLanguage}
            onSelect={selectLanguage}
          />
        </div>
        <button
          type="button"
          className="pf-icon-button pf-theme-button"
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
              <LanguageSelect
                preference={languagePreference}
                language={currentLanguage}
                onSelect={selectLanguage}
              />
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

/** Keep native option values: choosing the current language must still turn auto-detection off. */
function LanguageSelect({
  preference,
  language,
  onSelect,
}: {
  preference: string;
  language: string;
  onSelect: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="pf-language-select">
      <SelectControl
        aria-label={t('workbench.language')}
        value={preference}
        onValueChange={onSelect}
      >
        {SUPPORTED_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
        <option value="auto">
          {preference === 'auto'
            ? `${language} · ${t('workbench.languageAuto')}`
            : t('workbench.languageAuto')}
        </option>
      </SelectControl>
      <span className="pf-language-value" aria-hidden="true">
        {language}
      </span>
    </span>
  );
}
