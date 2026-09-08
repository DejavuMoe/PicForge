import { describe, expect, it } from 'vitest';
import { browserLanguage, resolveLanguage, supportedLanguage } from './languagePreference';

describe('browser language and explicit preferences', () => {
  it.each([
    ['en-GB', 'en'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['zh-Hans-SG', 'zh-CN'],
    ['zh-Hant', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh_MO', 'zh-TW'],
    ['fr-FR', undefined],
  ])('maps %s to %s', (tag, result) => expect(supportedLanguage(tag)).toBe(result));
  it('uses the first supported browser preference and otherwise English', () => {
    expect(browserLanguage(['fr-FR', 'ja-JP', 'en-US'])).toBe('ja');
    expect(browserLanguage(['de-DE', 'fr'])).toBe('en');
    expect(browserLanguage([])).toBe('en');
  });
  it('keeps URL previews separate from a manual preference', () => {
    expect(resolveLanguage({ query: 'zh-TW', preference: 'ko', languages: ['en-US'] })).toBe(
      'zh-TW',
    );
    expect(resolveLanguage({ preference: 'ko', languages: ['en-US'] })).toBe('ko');
    expect(resolveLanguage({ preference: 'auto', languages: ['en-US'] })).toBe('en');
  });
  it('ignores unsupported overrides instead of selecting a missing resource', () => {
    expect(resolveLanguage({ query: 'fr', preference: 'de', languages: ['zh-HK'] })).toBe('zh-TW');
  });
});
