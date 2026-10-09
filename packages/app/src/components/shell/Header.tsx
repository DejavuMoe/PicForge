import { useEffect, useRef, type CSSProperties } from 'react';
import { FiGithub, FiMoon, FiMoreHorizontal, FiSun } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../hooks/useThemeColors';
import { SUPPORTED_LANGUAGES, chooseLanguage } from '../../i18n';
import type { ToolId } from '../../types';
import { IconButton } from '../ui/IconButton';
import { Select } from '../ui/Select';
import { BrandMark } from './BrandMark';

const TOOLS = ['compression', 'android', 'ios'] as const;

export function Header({
  tool,
  onHome,
  onSelect,
}: {
  tool: ToolId;
  onHome: () => void;
  onSelect: (tool: ToolId) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useThemeColors();
  const language = i18n.resolvedLanguage ?? 'en';
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
  const current = TOOLS.indexOf(tool as (typeof TOOLS)[number]);
  const themeIcon = theme.colorMode === 'dark' ? <FiSun aria-hidden /> : <FiMoon aria-hidden />;
  return (
    <header className="pf-header">
      <button
        type="button"
        className="pf-brand-button"
        onClick={onHome}
        aria-label={t('entry.home')}
      >
        <BrandMark />
        <span className="pf-brand-title">PicForge</span>
      </button>
      {tool !== 'home' && (
        <>
          <nav className="pf-tool-nav" aria-label={t('workbench.tools')}>
            <div
              className="pf-tool-nav-track"
              style={{ '--pf-seg-index': current, '--pf-seg-count': TOOLS.length } as CSSProperties}
            >
              <span className="pf-segmented-indicator" aria-hidden />
              {TOOLS.map((value, index) => (
                <button
                  type="button"
                  key={value}
                  aria-current={tool === value ? 'page' : undefined}
                  onClick={() => onSelect(value)}
                >
                  <span className="pf-tool-index" aria-hidden>
                    0{index + 1}
                  </span>
                  {t(`nav.${value}`)}
                </button>
              ))}
            </div>
          </nav>
          <div className="pf-mobile-tool">
            <Select
              variant="quiet"
              aria-label={t('workbench.tools')}
              value={tool}
              onValueChange={(value) => onSelect(value as ToolId)}
            >
              {TOOLS.map((value) => (
                <option key={value} value={value}>
                  {t(`nav.${value}`)}
                </option>
              ))}
            </Select>
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
        <span className="pf-header-rule" aria-hidden />
        <div className="pf-language-control">
          <LanguageSelect language={language} onSelect={selectLanguage} />
        </div>
        <IconButton
          className="pf-theme-button"
          label={t('tooltips.toggleColorMode')}
          icon={themeIcon}
          onClick={theme.toggleColorMode}
        />
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
              <span className="pf-field-label">{t('workbench.language')}</span>
              <LanguageSelect language={language} onSelect={selectLanguage} />
              <button type="button" className="pf-preference-row" onClick={theme.toggleColorMode}>
                {themeIcon}
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
    <Select
      variant="quiet"
      aria-label={t('workbench.language')}
      value={language}
      onValueChange={onSelect}
    >
      {SUPPORTED_LANGUAGES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </Select>
  );
}
