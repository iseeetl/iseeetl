export const MAX_SUPPLEMENT_TITLE_LENGTH = 50;

export const isValidSupplementTitle = (value) =>
  value == null || (typeof value === 'string' && value.trim().length <= MAX_SUPPLEMENT_TITLE_LENGTH && !/[\r\n\u2028\u2029]/.test(value));

export function supplementTitleLanguage(title, initialTitle, initialLanguage, locale) {
  if (!title?.trim()) return null;
  return title.trim() === (initialTitle || '').trim() && initialLanguage ? initialLanguage : locale;
}

export function getSupplementTitle(supplement, locale) {
  if (!supplement?.title) return '';
  if (supplement.title_lang === locale) return supplement.title;
  return supplement.title_translations?.find((entry) => entry.lang === locale && entry.content)?.content || supplement.title;
}
