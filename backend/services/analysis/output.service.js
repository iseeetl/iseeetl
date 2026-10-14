const translationService = require('../translation.service');
const defaultLogger = require('../../utils/logger');
const { errorLogDetails } = require('../../utils/errorLogDetails');
const { makeLabelByLangFromTag, prefixWithLabel } = require('./labels');

const MAX_PROVIDER_CODE_POINTS = 300;
const MAX_SUPPLEMENT_UTF16_UNITS = 400;

const analysisLogContext = (snapshot, reason, startedAt) => ({
  source_type: snapshot.sourceType,
  source_id: snapshot.source._id,
  post_id: snapshot.chatId,
  reply_id: snapshot.replyId || null,
  setting_id: snapshot.settingId,
  kind: snapshot.kind,
  source_revision: snapshot.sourceRevision,
  setting_revision: snapshot.settingRevision,
  reason,
  stage: reason.includes('translation') ? 'translation' : 'output_validation',
  elapsed_ms: Date.now() - startedAt,
});

const translationLogContext = (snapshot, field) => ({
  source_type: snapshot.sourceType,
  source_id: snapshot.source._id,
  post_id: snapshot.chatId,
  reply_id: snapshot.replyId || null,
  setting_id: snapshot.settingId,
  kind: snapshot.kind,
  field,
});

const normalizeProviderOutput = (value) =>
  typeof value === 'string' ? value.trim() : '';

const truncateSpeechWithPrefix = ({ label, text }) => {
  const prefix = prefixWithLabel(label, '');
  const bodyLimit = MAX_SUPPLEMENT_UTF16_UNITS - prefix.length - 1;
  if (bodyLimit < 0) return null;
  let body = '';
  for (const character of text) {
    if (body.length + character.length > bodyLimit) break;
    body += character;
  }
  return `${prefix}${body}…`;
};

const buildBaseContent = ({ snapshot, providerOutput, logger, startedAt = Date.now() }) => {
  const text = normalizeProviderOutput(providerOutput);
  if (!text) {
    logger.error('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'empty', startedAt));
    return null;
  }
  if (snapshot.kind !== 'speech' && [...text].length > MAX_PROVIDER_CODE_POINTS) {
    logger.error('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'provider_code_points', startedAt));
    return null;
  }

  const baseLang = ['vision', 'audioScene', 'video'].includes(snapshot.kind)
    ? 'ja'
    : snapshot.source.lang;
  const label = makeLabelByLangFromTag(snapshot.triggerTag)(baseLang);
  let content = prefixWithLabel(label, text);
  if (content.length > MAX_SUPPLEMENT_UTF16_UNITS) {
    if (snapshot.kind !== 'speech') {
      logger.error('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'base_utf16_units', startedAt));
      return null;
    }
    content = truncateSpeechWithPrefix({ label, text });
    if (!content || content.length === 0 || content.length > MAX_SUPPLEMENT_UTF16_UNITS) {
      logger.error('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'prefix_utf16_units', startedAt));
      return null;
    }
    logger.warn('AI_ANALYSIS_OUTPUT_TRUNCATED', analysisLogContext(snapshot, 'base_utf16_units', startedAt));
  }
  return { baseLang, content, text };
};

const buildTranslations = async ({ snapshot, base, translateContent, logger, startedAt }) => {
  const targets = [...new Set(snapshot.targetLangs)].filter((lang) => lang && lang !== base.baseLang);
  if (targets.length === 0) return [];

  let translated;
  try {
    translated = await translateContent(
      snapshot.resultUserId,
      base.text,
      base.baseLang,
      targets,
      translationLogContext(snapshot, 'body')
    );
  } catch (error) {
    logger.error('AI_ANALYSIS_TRANSLATION_FAILED', {
      ...analysisLogContext(snapshot, 'translation_failed', startedAt),
      field: 'body',
      target_languages: targets,
      ...errorLogDetails(error),
    });
    return [];
  }

  const labelByLang = makeLabelByLangFromTag(snapshot.triggerTag);
  return (Array.isArray(translated) ? translated : []).flatMap((translation) => {
    const text = normalizeProviderOutput(translation?.content);
    if (!translation?.lang || !text || translation.lang === base.baseLang) return [];
    const content = prefixWithLabel(labelByLang(translation.lang), text);
    return [{
      user: snapshot.resultUserId,
      guest_id: null,
      lang: translation.lang,
      content,
    }];
  });
};

const buildTitleTranslations = async ({ snapshot, translateContent, logger, startedAt }) => {
  if (!snapshot.resultTitle || !snapshot.resultTitleLang) return [];
  const targets = [...new Set(snapshot.targetLangs)].filter((lang) => lang && lang !== snapshot.resultTitleLang);
  if (!targets.length) return [];
  try {
    const translations = await translateContent(
      snapshot.resultUserId, snapshot.resultTitle, snapshot.resultTitleLang, targets,
      translationLogContext(snapshot, 'title')
    );
    return (Array.isArray(translations) ? translations : []).flatMap((entry) => {
      const content = normalizeProviderOutput(entry?.content).replace(/[\r\n\u2028\u2029]+/g, ' ');
      return content && targets.includes(entry.lang)
        ? [{ user: snapshot.resultUserId, guest_id: null, lang: entry.lang, content }]
        : [];
    });
  } catch (error) {
    logger.error('AI_ANALYSIS_TRANSLATION_FAILED', {
      ...analysisLogContext(snapshot, 'title_translation_failed', startedAt), ...errorLogDetails(error),
      field: 'title',
      target_languages: targets,
    });
    return [];
  }
};

const buildAnalysisSupplement = async ({
  snapshot,
  providerOutput,
  translateContent = translationService.translateContent,
  logger = defaultLogger,
  startedAt = Date.now(),
}) => {
  const base = buildBaseContent({ snapshot, providerOutput, logger, startedAt });
  if (!base) return null;
  const translations = await buildTranslations({
    snapshot,
    base,
    translateContent,
    logger,
    startedAt,
  });
  return {
    user: snapshot.resultUserId,
    title: snapshot.resultTitle || null,
    title_lang: snapshot.resultTitle ? snapshot.resultTitleLang : null,
    title_translations: await buildTitleTranslations({ snapshot, translateContent, logger, startedAt }),
    lang: base.baseLang,
    content: base.content,
    translations,
    meta: {
      analysis_kind: snapshot.kind,
      analysis_setting: snapshot.settingId,
      analysis_setting_revision: snapshot.settingRevision,
      analysis_trigger_tag: snapshot.triggerTag._id,
      analysis_source_revision: snapshot.sourceRevision,
    },
  };
};

module.exports = {
  MAX_PROVIDER_CODE_POINTS,
  MAX_SUPPLEMENT_UTF16_UNITS,
  buildAnalysisSupplement,
  buildBaseContent,
  normalizeProviderOutput,
  truncateSpeechWithPrefix,
};
