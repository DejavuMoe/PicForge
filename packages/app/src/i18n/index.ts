/** Browser locale by default; only an explicit user choice is persisted.
 * URL overrides are transient previews and never pollute the saved preference.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  browserLanguage,
  getLanguagePreference,
  initialLanguage,
  LANGUAGE_PREFERENCE_KEY,
  supportedLanguage,
} from './languagePreference';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
] as const;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    ja: { translation: ja },
    ko: { translation: ko },
  },
  lng: initialLanguage(),
  supportedLngs: ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'],
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export function chooseLanguage(value: string) {
  const language = supportedLanguage(value);
  try {
    if (language) localStorage.setItem(LANGUAGE_PREFERENCE_KEY, language);
    else localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    /* Language switching still works when storage is unavailable. */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('lng');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return i18n.changeLanguage(
    language ?? browserLanguage(navigator.languages ?? [navigator.language]),
  );
}

window.addEventListener('languagechange', () => {
  if (getLanguagePreference() === 'auto' && !new URLSearchParams(location.search).has('lng'))
    void i18n.changeLanguage(browserLanguage(navigator.languages ?? [navigator.language]));
});

export default i18n;
