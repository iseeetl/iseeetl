export default {
  getTitle(data, targetLang) {
    if (!data.lang) return data.title;
    if (data.lang === targetLang) return data.title;
    // 翻訳が存在しない場合は原文を表示する。
    if (data.translations === undefined) return data.title;
    const translation = data.translations.find((translation) => translation.lang === targetLang);
    if (translation === undefined) return data.title;
    return translation.title;
  },

  getDescription(data, targetLang) {
    if (!data.lang) return data.description;
    if (data.lang === targetLang) return data.description;
    // 翻訳が存在しない場合は原文を表示する。
    if (data.translations === undefined) return data.description;
    const translation = data.translations.find((translation) => translation.lang === targetLang);
    if (translation === undefined) return data.description;
    return translation.description;
  },

  getTagName(tag, targetLang) {
    if (!tag.translations) return tag.name;
    // 表示言語の翻訳がなければ元のタグ名を使う。
    const translation = tag.translations.find((translation) => translation.lang === targetLang);
    if (translation) return translation.name;
    return tag.name;
  },

  getContent(data, targetLang) {
    // 本文を翻訳表示する場合は、表示言語、英語、原文の順に選ぶ。
    if (data.lang === targetLang) return data.content;
    if (!data.translations) return data.content;
    const translation = data.translations.find((translation) => translation.lang === targetLang);
    if (translation) return translation.content;
    const translationEn = data.translations.find((translation) => translation.lang === 'en');
    if (translationEn) return translationEn.content;
    return data.content;
  },

  needsTranslation(data, targetLang) {
    if (data.lang === targetLang) return false;
    if (!data.translations) return false;
    const translation = data.translations.find((translation) => translation.lang === targetLang);
    if (translation) return true;
    // 表示言語の翻訳がなければ、英語の翻訳の有無を確認する。
    const translationEn = data.translations.find((translation) => translation.lang === 'en');
    if (translationEn) return true;
    return false;
  },

  getTranslatedTagName(tagId, roomTags, targetLang) {
    if (!roomTags) return null;
    const tag = roomTags.find((tag) => tag._id === tagId);
    if (!tag) return null;
    if (!tag.translations) return tag.name;
    const translation = tag.translations.find((translation) => translation.lang === targetLang);
    if (!translation) return tag.name;
    return translation.name;
  },
};
