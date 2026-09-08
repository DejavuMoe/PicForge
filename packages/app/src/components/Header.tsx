import { useEffect, useRef, useState } from 'react';
import { FiMoon, FiSun, FiMoreHorizontal } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import { SUPPORTED_LANGUAGES, chooseLanguage } from '../i18n';
import { getLanguagePreference } from '../i18n/languagePreference';
import { SelectionRail } from './SelectionRail';
import { OpticalLayer } from './OpticalLayer';
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
  const selectLanguage = (value: string) => {
    setLanguagePreference(value);
    void chooseLanguage(value);
  };
  const about = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.pf-select-menu')) return;
      if (about.current?.open && !about.current.contains(event.target as Node))
        about.current.open = false;
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, []);
  return (
    <header className="pf-header">
      <OpticalLayer />
      <button
        type="button"
        className="pf-brand-button"
        onClick={onHome}
        aria-label={t('entry.home')}
      >
        <span className="pf-logo" aria-hidden="true">
          P
        </span>
        <span className="pf-brand-title">PicForge</span>
      </button>
      {tool !== 'home' && (
        <>
          <SelectionRail
            as="nav"
            activeKey={tool}
            className="pf-tool-nav"
            aria-label={t('workbench.tools')}
          >
            {TOOLS.map((value) => (
              <button
                type="button"
                key={value}
                aria-current={tool === value ? 'page' : undefined}
                onClick={() => onSelect(value)}
              >
                {t(`motion.${value}`)}
              </button>
            ))}
          </SelectionRail>
          <div className="pf-mobile-tool">
            <SelectControl
              aria-label={t('workbench.tools')}
              value={tool}
              onValueChange={(value) => onSelect(value as ToolId)}
            >
              {TOOLS.map((value) => (
                <option key={value} value={value}>
                  {t(`motion.${value}`)}
                </option>
              ))}
            </SelectControl>
          </div>
        </>
      )}
      <div className="pf-header-actions">
        <div className="pf-language-control">
          <SelectControl
            aria-label={t('workbench.language')}
            value={languagePreference}
            onValueChange={selectLanguage}
          >
            <option value="auto">{t('workbench.languageAuto')}</option>
            {SUPPORTED_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </SelectControl>
        </div>
        <button
          type="button"
          className="pf-icon-button pf-theme-button"
          aria-label={t('tooltips.toggleColorMode')}
          onClick={theme.toggleColorMode}
        >
          {theme.colorMode === 'light' ? <FiMoon aria-hidden /> : <FiSun aria-hidden />}
        </button>
        <details
          ref={about}
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
              <SelectControl
                aria-label={t('workbench.language')}
                value={languagePreference}
                onValueChange={selectLanguage}
              >
                <option value="auto">{t('workbench.languageAuto')}</option>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </SelectControl>
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
