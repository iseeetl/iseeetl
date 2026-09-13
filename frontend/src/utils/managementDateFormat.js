import { DEFAULT_LOCALE, normalizeLocale } from '@/utils/dateUtil';

const toDate = (dateValue) => {
  if (!dateValue) return null;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateValue = (dateValue, { locale = DEFAULT_LOCALE, timeZone = null } = {}) => {
  const date = toDate(dateValue);
  if (!date) return '';

  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };
  if (timeZone) options.timeZone = timeZone;

  try {
    return new Intl.DateTimeFormat(normalizeLocale(locale), options).format(date);
  } catch {
    return '';
  }
};

const createManagementDateFormatterMethods = () => ({
  formatManagementDate(dateValue) {
    return formatDateValue(dateValue, {
      locale: this.$i18n?.locale || this.$store?.getters?.lang || DEFAULT_LOCALE,
      timeZone: this.$data?.dateTimeZone || null,
    });
  },
});

export { formatDateValue, createManagementDateFormatterMethods };
