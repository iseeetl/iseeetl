import { LANGUAGES } from '@/constants/languages.js';

const SUPPORTED_LOCALES = new Set(LANGUAGES.map(({ value }) => value));
const CRAWLER_MARKERS = ['googlebot', 'msnbot', 'bingbot', 'facebookexternalhit', 'twitterbot', 'linespider'];

export const isCrawlerUserAgent = (userAgent = '') => {
  const normalized = typeof userAgent === 'string' ? userAgent.toLowerCase() : '';
  return CRAWLER_MARKERS.some((marker) => normalized.includes(marker));
};

export const normalizeSupportedLocale = (locale, fallbackLocale = 'en') => {
  const fallback = SUPPORTED_LOCALES.has(fallbackLocale) ? fallbackLocale : 'en';
  if (typeof locale !== 'string') return fallback;
  const normalized = locale.trim().toLowerCase().split(/[-_]/u)[0];
  return SUPPORTED_LOCALES.has(normalized) ? normalized : fallback;
};

export const resolveBrowserLocale = (navigatorObject = globalThis.navigator) => {
  const locale =
    (navigatorObject?.languages && navigatorObject.languages[0]) ||
    navigatorObject?.language ||
    navigatorObject?.userLanguage ||
    navigatorObject?.browserLanguage;
  return normalizeSupportedLocale(locale);
};

export const resolveInitialLocale = (navigatorObject = globalThis.navigator) =>
  isCrawlerUserAgent(navigatorObject?.userAgent) ? 'ja' : resolveBrowserLocale(navigatorObject);
