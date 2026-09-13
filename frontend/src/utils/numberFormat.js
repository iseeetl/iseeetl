import { normalizeSupportedLocale } from '@/utils/locale.js';

export const formatLocaleNumber = (value, locale = 'en') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat(normalizeSupportedLocale(locale)).format(number);
};
