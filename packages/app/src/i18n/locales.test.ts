import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

function strings(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix + key;
      return typeof child === 'string'
        ? [[path, child]]
        : Object.entries(strings(child as Record<string, unknown>, path + '.'));
    }),
  );
}
const source = strings(en);
describe('translations', () => {
  for (const [locale, data] of Object.entries({ zhCN, zhTW, ja, ko })) {
    it(`${locale} includes every message and its interpolation parameters`, () => {
      const translated = strings(data);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort());
      for (const [key, text] of Object.entries(source)) {
        expect(translated[key].trim(), key).not.toBe('');
        expect(translated[key].match(/\{\{[^}]+\}\}/g)?.sort() ?? [], key).toEqual(
          text.match(/\{\{[^}]+\}\}/g)?.sort() ?? [],
        );
      }
    });
  }
});
