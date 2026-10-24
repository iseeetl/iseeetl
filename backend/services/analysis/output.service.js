const translationService = require('../translation.service');
const defaultLogger = require('../../utils/logger');
const { errorLogDetails } = require('../../utils/errorLogDetails');
const { makeLabelByLangFromTag, prefixWithLabel } = require('./labels');

// 外部サービスの本文ではなく、固定の案内として表示する内部結果。日英は翻訳サービスなしで保存する。
const NOTICE_MESSAGES = Object.freeze({
  'conversation-failed': Object.freeze({
    ja: 'AIの補足情報を生成できませんでした。',
    en: 'Could not generate AI supplementary information.',
  }),
  'no-speech': Object.freeze({
    ja: '発話を検出できませんでした',
    en: 'No speech was detected.',
  }),
  'no-sound': Object.freeze({
    ja: '解析用の音声データは無音です。音源や周囲の状況は判断できません。',
    en: 'The audio data contains no sound. The source or surroundings cannot be determined.',
  }),
  'no-description': Object.freeze({
    ja: '音の説明を生成できませんでした。',
    en: 'Could not generate a description of the sounds.',
  }),
  'low-level': Object.freeze({
    ja: '録音レベルが非常に低く、はっきり聞き取れる音はありません。',
    en: 'The recording level is very low and no sound can be clearly heard.',
  }),
});
// 解析種別ごとに受け付ける内部結果。他の種別や未知のstatusは無効な出力として扱う。
const NOTICE_STATUSES_BY_KIND = Object.freeze({
  conversation: Object.freeze(['conversation-failed']),
  speech: Object.freeze(['no-speech']),
  audioScene: Object.freeze(['no-sound', 'low-level', 'no-description']),
});

const resolveNotice = (snapshot, providerOutput) => {
  const status = providerOutput?.status;
  if (typeof status !== 'string') return null;
  const accepted = NOTICE_STATUSES_BY_KIND[snapshot.kind] || [];
  return accepted.includes(status) ? status : null;
};

const { MAX_SUPPLEMENT_UTF16_UNITS } = require('./conversationBudget');

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
  const notice = resolveNotice(snapshot, providerOutput);
  // noSpeechは互換のために残す。固定の案内を表示する内部結果全般を指す。
  const noSpeech = Boolean(notice);
  const noticeLang = snapshot.source.lang === 'ja' ? 'ja' : 'en';
  const text = notice ? NOTICE_MESSAGES[notice][noticeLang] : normalizeProviderOutput(providerOutput);
  if (!text) {
    logger.error('AI_ANALYSIS_OUTPUT_INVALID', analysisLogContext(snapshot, 'empty', startedAt));
    return null;
  }

  const baseLang = noSpeech ? noticeLang : ['vision', 'audioScene', 'video'].includes(snapshot.kind)
    ? 'ja'
    : snapshot.source.lang;
  const label = makeLabelByLangFromTag(snapshot.triggerTag)(baseLang);
  let content = prefixWithLabel(label, text);
  const contentLimit = MAX_SUPPLEMENT_UTF16_UNITS;
  if (content.length > contentLimit) {
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
  return { baseLang, content, text, noSpeech, notice };
};

const buildTranslations = async ({ snapshot, base, translateContent, logger, startedAt }) => {
  const fixedMessages = base.notice ? NOTICE_MESSAGES[base.notice] : null;
  const targets = [...new Set(fixedMessages
    ? [...snapshot.targetLangs, snapshot.source.lang, 'ja', 'en']
    : snapshot.targetLangs)].filter((lang) => lang && lang !== base.baseLang);
  const fixedTranslations = fixedMessages ? targets.filter((lang) => fixedMessages[lang]).map((lang) => ({
    user: snapshot.resultUserId, guest_id: null, lang,
    content: prefixWithLabel(makeLabelByLangFromTag(snapshot.triggerTag)(lang), fixedMessages[lang]),
  })) : [];
  const translationTargets = fixedMessages ? targets.filter((lang) => !fixedMessages[lang]) : targets;
  if (translationTargets.length === 0) return fixedTranslations;

  let translated;
  try {
    translated = await translateContent(
      snapshot.resultUserId,
      base.text,
      base.baseLang,
      translationTargets,
      translationLogContext(snapshot, 'body')
    );
  } catch (error) {
    logger.error('AI_ANALYSIS_TRANSLATION_FAILED', {
      ...analysisLogContext(snapshot, 'translation_failed', startedAt),
      field: 'body',
      target_languages: translationTargets,
      ...errorLogDetails(error),
    });
    return fixedTranslations;
  }

  const labelByLang = makeLabelByLangFromTag(snapshot.triggerTag);
  return [...fixedTranslations, ...(Array.isArray(translated) ? translated : []).flatMap((translation) => {
    const text = normalizeProviderOutput(translation?.content);
    if (!translation?.lang || !text || translation.lang === base.baseLang) return [];
    const content = prefixWithLabel(labelByLang(translation.lang), text);
    return [{
      user: snapshot.resultUserId,
      guest_id: null,
      lang: translation.lang,
      content,
    }];
  })];
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
  MAX_SUPPLEMENT_UTF16_UNITS,
  NOTICE_MESSAGES,
  buildAnalysisSupplement,
  buildBaseContent,
  normalizeProviderOutput,
  truncateSpeechWithPrefix,
};
