const { makeLabelByLangFromTag, prefixWithLabel } = require('./labels');

const MAX_SUPPLEMENT_UTF16_UNITS = 400;
const MAX_CONVERSATION_UTF16_UNITS = 2000;
// 保存時と同じUTF-16単位で、選択言語のタグ接頭辞を先に差し引く。
const conversationBodyLimit = (snapshot) => Math.max(0, MAX_CONVERSATION_UTF16_UNITS -
  prefixWithLabel(makeLabelByLangFromTag(snapshot.triggerTag)(snapshot.source.lang), '').length);

module.exports = { MAX_SUPPLEMENT_UTF16_UNITS, MAX_CONVERSATION_UTF16_UNITS, conversationBodyLimit };
