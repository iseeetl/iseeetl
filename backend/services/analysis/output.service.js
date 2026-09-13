const translationService = require('../translation.service');
const defaultLogger = require('../../utils/logger');
const { makeLabelByLangFromTag, prefixWithLabel } = require('./labels');

const MAX_PROVIDER_CODE_POINTS = 300;
const MAX_SUPPLEMENT_UTF16_UNITS = 400;

const analysisLogContext = (snapshot, reason) => ({
  source_type: snapshot.sourceType,
  source_id: snapshot.source._id,
  setting_id: snapshot.settingId,
  kind: snapshot.kind,
  source_revision: snapshot.sourceRevision,
  setting_revision: snapshot.settingRevision,
  reason,
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

const buildBaseContent = ({ snapshot, providerOutput, logger }) => {
  const text = normalizeProviderOutput(providerOutput);
  if (!text) {
    logger.warn('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'empty'));
    return null;
  }
  if (snapshot.kind !== 'speech' && [...text].length > MAX_PROVIDER_CODE_POINTS) {
    logger.warn('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'provider_code_points'));
    return null;
  }

  const baseLang = ['vision', 'audioScene', 'video'].includes(snapshot.kind)
    ? 'ja'
    : snapshot.source.lang;
  const label = makeLabelByLangFromTag(snapshot.triggerTag)(baseLang);
  let content = prefixWithLabel(label, text);
  if (content.length > MAX_SUPPLEMENT_UTF16_UNITS) {
    if (snapshot.kind !== 'speech') {
      logger.warn('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'base_utf16_units'));
      return null;
    }
    content = truncateSpeechWithPrefix({ label, text });
    if (!content || content.length === 0 || content.length > MAX_SUPPLEMENT_UTF16_UNITS) {
      logger.warn('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'prefix_utf16_units'));
      return null;
    }
    logger.warn('AI_ANALYSIS_OUTPUT_TRUNCATED', analysisLogContext(snapshot, 'base_utf16_units'));
  }
  return { baseLang, content, text };
};

const buildTranslations = async ({ snapshot, base, translateContent, logger }) => {
  const targets = [...new Set(snapshot.targetLangs)].filter((lang) => lang && lang !== base.baseLang);
  if (targets.length === 0) return [];

  let translated;
  try {
    translated = await translateContent(
      snapshot.resultUserId,
      base.text,
      base.baseLang,
      targets
    );
  } catch (error) {
    logger.warn('AI_ANALYSIS_TRANSLATION_FAILED', {
      ...analysisLogContext(snapshot, 'translation_failed'),
      error_code: error?.code || null,
    });
    return [];
  }

  const labelByLang = makeLabelByLangFromTag(snapshot.triggerTag);
  return (Array.isArray(translated) ? translated : []).flatMap((translation) => {
    const text = normalizeProviderOutput(translation?.content);
    if (!translation?.lang || !text || translation.lang === base.baseLang) return [];
    const content = prefixWithLabel(labelByLang(translation.lang), text);
    if (content.length > MAX_SUPPLEMENT_UTF16_UNITS) {
      logger.warn(
        'AI_ANALYSIS_OUTPUT_INVALID',
        analysisLogContext(snapshot, 'translation_utf16_units')
      );
      return [];
    }
    return [{
      user: snapshot.resultUserId,
      guest_id: null,
      lang: translation.lang,
      content,
    }];
  });
};

const buildAnalysisSupplement = async ({
  snapshot,
  providerOutput,
  translateContent = translationService.translateContent,
  logger = defaultLogger,
}) => {
  const base = buildBaseContent({ snapshot, providerOutput, logger });
  if (!base) return null;
  const translations = await buildTranslations({
    snapshot,
    base,
    translateContent,
    logger,
  });
  return {
    user: snapshot.resultUserId,
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
