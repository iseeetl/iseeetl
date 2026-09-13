const pickTagNameByLang = (tag, preferredLang) => {
  if (!tag) return '';
  const translations = Array.isArray(tag.translations) ? tag.translations : [];
  const normalize = (value) =>
    String(value || '')
      .trim()
      .toLowerCase();
  const preferred = normalize(preferredLang);
  const base = preferred.split('-')[0];
  const findByLang = (lang) => {
    const hit = translations.find((translation) => normalize(translation?.lang) === normalize(lang));
    const name = typeof hit?.name === 'string' ? hit.name.trim() : '';
    return name || null;
  };

  const exact = findByLang(preferred);
  if (exact) return exact;
  if (base && base !== preferred) {
    const baseMatch = findByLang(base);
    if (baseMatch) return baseMatch;
  }
  return typeof tag.name === 'string' ? tag.name : '';
};

const makeLabelByLangFromTag = (tag) => (lang) => pickTagNameByLang(tag, lang);

const prefixWithLabel = (label, text) => `${label ? `#${label} ` : ''}${text}`;

const buildSupplementTargets = (targetLangs, parentLang, defaultLang = 'ja') => {
  const languages = new Set((Array.isArray(targetLangs) ? targetLangs : []).filter(Boolean));
  if (parentLang && parentLang !== defaultLang) languages.add(parentLang);
  languages.delete(defaultLang);
  return Array.from(languages);
};

const resolveParentLangForReply = (reply, chat) => reply?.lang || chat?.lang;

module.exports = {
  makeLabelByLangFromTag,
  pickTagNameByLang,
  prefixWithLabel,
  buildSupplementTargets,
  resolveParentLangForReply,
};
