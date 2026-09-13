const { translateText } = require('../integrations/google/translate.client');
const { canTranslate } = require('./googleApiUsage.service');
const { ALLOWED_LANGUAGES } = require('../constants/languages');
const logger = require('../utils/logger');
const { isGoogleTranslateEnabled } = require('../config/featureFlags');

function uniqFilteredTargets(targets, source) {
  const normalizedSource = typeof source === 'string' ? source.trim().toLowerCase() : source;
  const normalizedTargets = (Array.isArray(targets) ? targets : [])
    .filter((target) => typeof target === 'string')
    .map((target) => target.trim().toLowerCase())
    .filter((target) => ALLOWED_LANGUAGES.includes(target));
  const set = new Set(normalizedTargets);
  set.delete(normalizedSource);
  return Array.from(set);
}

const logTranslateError = (operation, error) => {
  logger.error(`[translation.service] ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });
};

const translateTargets = async (operation, targets, translateTarget) => {
  const settled = await Promise.allSettled(targets.map((lang) => translateTarget(lang)));
  const translations = [];
  const failedLanguages = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      translations.push(result.value);
      return;
    }
    const lang = targets[index];
    failedLanguages.push(lang);
    logTranslateError(`${operation}:${lang}`, result.reason);
  });
  Object.defineProperty(translations, 'failedLanguages', {
    value: Object.freeze(failedLanguages),
    enumerable: false,
  });
  return translations;
};

const getFailedTranslationLanguages = (translations) =>
  Array.isArray(translations?.failedLanguages) ? translations.failedLanguages : [];

module.exports = {
  async translateTitleAndDescription(userId, title, description, sourceLanguageCode, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      const contents = description ? [title, description] : [title];
      const textForCount = (title || '') + (description || '');
      if (!textForCount || targets.length === 0) return [];

      const ok = await canTranslate(textForCount, sourceLanguageCode, targets);
      if (!ok) return [];

      const results = await translateTargets('translateTitleAndDescription', targets, async (lang) => {
        const [tTitle, tDesc] = await translateText({
          contents,
          sourceLanguageCode,
          targetLanguageCode: lang,
        });
        return { user: userId, lang, title: tTitle, description: description ? tDesc : null };
      });
      return results;
    } catch (e) {
      logTranslateError('translateTitleAndDescription', e);
      return [];
    }
  },

  async translateTag(userId, tag, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const source = tag?.lang || 'ja';
      const name = tag?.name || '';
      const targets = uniqFilteredTargets(targetLanguageCodes, source);
      if (!name || targets.length === 0) return [];

      const ok = await canTranslate(name, source, targets);
      if (!ok) return [];

      const results = await translateTargets('translateTag', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [name],
          sourceLanguageCode: source,
          targetLanguageCode: lang,
        });
        // タグ名の互換性を保つため、翻訳結果を小文字に統一する。
        return { user: userId, lang, name: (translated || '').toLowerCase() };
      });
      return results;
    } catch (e) {
      logTranslateError('translateTag', e);
      return [];
    }
  },

  // 単語グループのtitleを翻訳し、各言語の結果をcontentに格納して返す。
  async translateQuickTextGroup(userId, group, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const source = group?.lang || 'ja';
      const title = group?.title || '';
      const targets = uniqFilteredTargets(targetLanguageCodes, source);
      if (!title || targets.length === 0) return [];

      const ok = await canTranslate(title, source, targets);
      if (!ok) return [];

      const results = await translateTargets('translateQuickTextGroup', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [title],
          sourceLanguageCode: source,
          targetLanguageCode: lang,
        });
        // 表示用の文言なので、翻訳結果の大文字・小文字を保持する。
        return { user: userId, lang, content: translated || '' };
      });
      return results;
    } catch (e) {
      logTranslateError('translateQuickTextGroup', e);
      return [];
    }
  },

  // 単語のlabelを翻訳し、各言語の結果をcontentに格納して返す。
  async translateQuickTextItem(userId, item, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const source = item?.lang || 'ja';
      const label = item?.label || '';
      const targets = uniqFilteredTargets(targetLanguageCodes, source);
      if (!label || targets.length === 0) return [];

      const ok = await canTranslate(label, source, targets);
      if (!ok) return [];

      const results = await translateTargets('translateQuickTextItem', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [label],
          sourceLanguageCode: source,
          targetLanguageCode: lang,
        });
        // 表示用の文言なので、翻訳結果の大文字・小文字を保持する。
        return { user: userId, lang, content: translated || '' };
      });
      return results;
    } catch (e) {
      logTranslateError('translateQuickTextItem', e);
      return [];
    }
  },

  async translateContent(userId, content, sourceLanguageCode, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      if (!content || targets.length === 0) return [];

      const ok = await canTranslate(content, sourceLanguageCode, targets);
      if (!ok) return [];

      const results = await translateTargets('translateContent', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [content],
          sourceLanguageCode,
          targetLanguageCode: lang,
        });
        return { user: userId || null, guest_id: null, lang, content: translated || '' };
      });
      return results;
    } catch (e) {
      logTranslateError('translateContent', e);
      return [];
    }
  },

  async translateGuestContent(guestId, content, sourceLanguageCode, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      if (!content || targets.length === 0) return [];

      const ok = await canTranslate(content, sourceLanguageCode, targets);
      if (!ok) return [];

      const results = await translateTargets('translateGuestContent', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [content],
          sourceLanguageCode,
          targetLanguageCode: lang,
        });
        return { user: null, guest_id: guestId || null, lang, content: translated || '' };
      });
      return results;
    } catch (e) {
      logTranslateError('translateGuestContent', e);
      return [];
    }
  },
};

module.exports.getFailedTranslationLanguages = getFailedTranslationLanguages;
