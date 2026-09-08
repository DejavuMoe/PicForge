export type AppLanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko';
export const LANGUAGE_PREFERENCE_KEY = 'picforge.language';

/** Canonicalize region/script tags before selecting a resource or displaying the picker. */
export function supportedLanguage(tag: string | null | undefined): AppLanguage | undefined {
  if (!tag) return undefined;
  const normalized = tag.trim().replace(/_/g, '-').toLowerCase();
  if (/^zh(?:-|$)/.test(normalized))
    return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(normalized) ? 'zh-TW' : 'zh-CN';
  const base = normalized.split('-')[0];
  return base === 'en' || base === 'ja' || base === 'ko' ? base : undefined;
}

export function browserLanguage(languages: readonly string[]): AppLanguage {
  return languages.map(supportedLanguage).find((language) => language !== undefined) ?? 'en';
}

export function resolveLanguage({
  query,
  preference,
  languages,
}: {
  query?: string | null;
  preference?: string | null;
  languages: readonly string[];
}): AppLanguage {
  return supportedLanguage(query) ?? supportedLanguage(preference) ?? browserLanguage(languages);
}

export function getLanguagePreference(): AppLanguage | 'auto' {
  try {
    return supportedLanguage(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function initialLanguage(): AppLanguage {
  return resolveLanguage({
    query: new URLSearchParams(window.location.search).get('lng'),
    preference: getLanguagePreference(),
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
  });
}
