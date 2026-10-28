const { translateText, translateTextWithMetadata } = require('../integrations/google/translate.client');
const { canTranslate } = require('./googleApiUsage.service');
const { ALLOWED_LANGUAGES } = require('../constants/languages');
const logger = require('../utils/logger');
const { errorLogDetails, safeDiagnostic } = require('../utils/errorLogDetails');
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

const translationLogContext = (context) => context ? Object.fromEntries(
  ['source_type', 'source_id', 'post_id', 'reply_id', 'setting_id', 'kind', 'field']
    .map((key) => [key, safeDiagnostic(context[key])])
) : {};

const logTranslateError = (operation, error, context = {}) => {
  logger.error(`[translation.service] ${operation} failed`, {
    reason: 'translation_failed',
    ...context,
    ...errorLogDetails(error),
  });
};

const checkTranslationUsage = async (operation, content, source, targets, context = {}) => {
  try {
    return await canTranslate(content, source, targets);
  } catch (error) {
    logTranslateError(operation, error, {
      ...context,
      reason: 'usage_check_failed',
      source_language: safeDiagnostic(source),
      target_languages: targets,
    });
    return false;
  }
};

const translateTargets = async (operation, targets, translateTarget, context = {}) => {
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
    logTranslateError(`${operation}:${lang}`, result.reason, {
      ...context, reason: 'provider_failed', target_language: lang,
    });
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
  // Use automatic source detection for transcripts; the UI/post language is not the spoken language.
  async translateTranscription(userId, content, targetLanguageCodes, logContext) {
    const context = translationLogContext(logContext);
    const empty = { lang: null, translations: [] };
    if (!isGoogleTranslateEnabled()) return empty;
    const targets = uniqFilteredTargets(targetLanguageCodes, null);
    if (!content || !targets.length) return empty;
    if (!await checkTranslationUsage('translateTranscription', content, null, targets, context)) return empty;
    const detected = [];
    const translations = await translateTargets('translateTranscription', targets, async (lang) => {
      const [result] = await translateTextWithMetadata({ contents: [content], targetLanguageCode: lang });
      if (typeof result?.text !== 'string' || !result.text.trim()) throw new Error('Empty translation');
      const source = String(result.detectedLanguageCode || '').toLowerCase().split('-')[0];
      detected.push(ALLOWED_LANGUAGES.includes(source) ? source : null);
      return { user: userId || null, guest_id: null, lang, content: result.text };
    }, context);
    const sources = [...new Set(detected)];
    const lang = sources.length === 1 ? sources[0] : null;
    return { lang, translations };
  },
  async translateTitleAndDescription(userId, title, description, sourceLanguageCode, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      const contents = description ? [title, description] : [title];
      const textForCount = (title || '') + (description || '');
      if (!textForCount || targets.length === 0) return [];

      const ok = await checkTranslationUsage('translateTitleAndDescription', textForCount, sourceLanguageCode, targets);
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

      const ok = await checkTranslationUsage('translateTag', name, source, targets);
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

      const ok = await checkTranslationUsage('translateQuickTextGroup', title, source, targets);
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

      const ok = await checkTranslationUsage('translateQuickTextItem', label, source, targets);
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

  async translateContent(userId, content, sourceLanguageCode, targetLanguageCodes, logContext) {
    if (!isGoogleTranslateEnabled()) return [];
    const context = translationLogContext(logContext);
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      if (!content || targets.length === 0) return [];

      const ok = await checkTranslationUsage('translateContent', content, sourceLanguageCode, targets, context);
      if (!ok) return [];

      const results = await translateTargets('translateContent', targets, async (lang) => {
        const [translated] = await translateText({
          contents: [content],
          sourceLanguageCode,
          targetLanguageCode: lang,
        });
        return { user: userId || null, guest_id: null, lang, content: translated || '' };
      }, context);
      return results;
    } catch (e) {
      logTranslateError('translateContent', e, context);
      return [];
    }
  },

  async translateGuestContent(guestId, content, sourceLanguageCode, targetLanguageCodes) {
    if (!isGoogleTranslateEnabled()) return [];
    try {
      const targets = uniqFilteredTargets(targetLanguageCodes, sourceLanguageCode);
      if (!content || targets.length === 0) return [];

      const ok = await checkTranslationUsage('translateGuestContent', content, sourceLanguageCode, targets);
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
