const AppError = require('./appError');
const { ALLOWED_LANGUAGES } = require('../constants/languages');

const MAX_TITLE_LENGTH = 50;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };

function normalizeTitle(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || LINE_BREAK.test(value)) return invalid();
  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) return invalid();
  return title || null;
}

function titleFields(body, current = {}, { titleKey = 'title', langKey = 'title_lang', fallbackLang = null } = {}) {
  const title = normalizeTitle(hasOwn(body, titleKey) ? body[titleKey] : current[titleKey]);
  const lang = hasOwn(body, langKey) ? body[langKey] : current[langKey] || fallbackLang;
  if (lang != null && !ALLOWED_LANGUAGES.includes(lang)) return invalid();
  if (title && !lang) return invalid();
  return { [titleKey]: title, [langKey]: title ? lang : null };
}

const titleChanged = (current, next) =>
  (current.title ?? null) !== (next.title ?? null) || (current.title_lang ?? null) !== (next.title_lang ?? null);

module.exports = { MAX_TITLE_LENGTH, LINE_BREAK, normalizeTitle, titleFields, titleChanged };
