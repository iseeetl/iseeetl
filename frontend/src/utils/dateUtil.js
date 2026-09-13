const DEFAULT_LOCALE = 'en';

const normalizeLocale = (languageCode) => {
  if (typeof languageCode !== 'string' || languageCode.trim() === '') return DEFAULT_LOCALE;
  const locale = languageCode.trim().replace('_', '-').toLowerCase();
  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length ? locale : DEFAULT_LOCALE;
};

const toDate = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ブラウザの言語とタイムゾーンに従って日付を整形する。
export default {
  getLocalDate(dateValue, languageCode, formatType) {
    const date = toDate(dateValue);
    if (!date) return '';

    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    if (formatType !== 'date') {
      Object.assign(options, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    return new Intl.DateTimeFormat(normalizeLocale(languageCode), options).format(date);
  },
};

export { DEFAULT_LOCALE, normalizeLocale };
