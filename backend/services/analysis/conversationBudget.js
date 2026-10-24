const { makeLabelByLangFromTag, prefixWithLabel } = require('./labels');
const { MAX_SUPPLEMENT_UTF16_UNITS } = require('../../constants/contentLimits');

// 保存時と同じ言語・接頭辞を使い、全解析の本文予算を計算する。
const analysisBodyLimit = (snapshot) => {
  const language = ['vision', 'video', 'audioScene'].includes(snapshot.kind) ? 'ja' : snapshot.source.lang;
  return Math.max(0, MAX_SUPPLEMENT_UTF16_UNITS -
    prefixWithLabel(makeLabelByLangFromTag(snapshot.triggerTag)(language), '').length);
};
module.exports = { MAX_SUPPLEMENT_UTF16_UNITS, analysisBodyLimit };
