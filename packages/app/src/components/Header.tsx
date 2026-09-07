import { useEffect, useRef, useState } from 'react';
import { FiGithub, FiGlobe, FiMoon, FiSun } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import type { ToolId } from '../types';
import { SUPPORTED_LANGUAGES } from '../i18n';

const SHORT_LANG: Record<string, string> = {
  en: 'EN',
  'zh-CN': '中',
  'zh-TW': '繁',
  ja: 'JP',
  ko: 'KR',
};

interface HeaderProps {
  onHome: () => void;
  tool: ToolId;
  onSelect: (tool: ToolId) => void;
}

export function Header({ onHome, tool, onSelect }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);

  const currentLang =
    SUPPORTED_LANGUAGES.find((language) => language.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!isLanguageOpen) return undefined;

    // Move focus into the menu so keyboard users land on the current language.
    const menu = languageMenuRef.current;
    const initial =
      menu?.querySelector<HTMLButtonElement>('.pf-language-item.is-active') ??
      menu?.querySelector<HTMLButtonElement>('.pf-language-item');
    initial?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isLanguageOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsLanguageOpen(false);
      languageButtonRef.current?.focus();
      return;
    }
    const items = Array.from(
      languageMenuRef.current?.querySelectorAll<HTMLButtonElement>('.pf-language-item') ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(event.target as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setIsLanguageOpen(false);
    }
  };

  return (
    <header className="pf-header">
      <button
        type="button"
        className="pf-brand-link pf-brand-button"
        onClick={onHome}
        aria-label={t('app.title')}
      >
        <span className="pf-brand">
          <span className="pf-logo">P</span>
          <span className="pf-brand-title">{t('app.title')}</span>
        </span>
      </button>

      <nav className="pf-tool-nav" aria-label={t('landing.toolsTitle')}>
        {(['compression', 'android', 'ios'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-current={tool === value ? 'page' : undefined}
            onClick={() => onSelect(value)}
          >
            {t(`motion.${value}`)}
          </button>
        ))}
      </nav>
      <div className="pf-header-spacer" />

      <div className="pf-header-actions">
        <div className="pf-header-menu-wrap" ref={languageMenuRef} onKeyDown={handleMenuKeyDown}>
          <button
            type="button"
            className="pf-header-button"
            ref={languageButtonRef}
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
                    languageButtonRef.current?.focus();
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
