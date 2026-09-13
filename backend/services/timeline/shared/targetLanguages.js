const { ALLOWED_LANGUAGES } = require('../../../constants/languages');

const allowed = new Set(ALLOWED_LANGUAGES);

function normalizeLanguages(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter((lang) => allowed.has(lang))));
}

// 翻訳先が配列で指定された場合はそのまま使い、省略時はフロア設定とルーム接続者の言語から決める。
function resolveMutationTargetLangs({ requested, floor, roomId, io, sourceLang }) {
  if (Array.isArray(requested)) return requested;

  let presenceLanguages = [];
  try {
    presenceLanguages = io?.roomLanguageProvider?.getLanguages(String(roomId)) || [];
  } catch {
    // 接続者の言語を取得できない場合は、フロアの翻訳設定だけで処理を続ける。
  }

  return normalizeLanguages([...(floor?.target_langs || []), ...presenceLanguages])
    .filter((lang) => lang !== sourceLang);
}

module.exports = {
  normalizeLanguages,
  resolveMutationTargetLangs,
};
