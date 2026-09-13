import { createI18n } from 'vue-i18n';

import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import he from './locales/he.json';
import hi from './locales/hi.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import sv from './locales/sv.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

export const localeMessages = Object.freeze({
  de,
  en,
  es,
  fr,
  he,
  hi,
  it,
  ja,
  ko,
  pt,
  ru,
  sv,
  tr,
  uk,
  vi,
  zh,
});

const slavicPluralRule = (choice, choicesLength, originalRule) => {
  if (choicesLength !== 3) return originalRule(choice, choicesLength);

  const absoluteChoice = Math.abs(choice);
  const mod10 = absoluteChoice % 10;
  const mod100 = absoluteChoice % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
};

const pluralRules = Object.freeze({
  ru: slavicPluralRule,
  uk: slavicPluralRule,
});

export const createApplicationI18n = ({
  locale = 'ja',
  fallbackLocale = 'ja',
  messages = localeMessages,
} = {}) =>
  createI18n({
    legacy: false,
    globalInjection: true,
    locale,
    fallbackLocale,
    messages,
    pluralRules,
  });

export const createI18nTranslator = (i18n) => (key) => i18n.global.t(key);
