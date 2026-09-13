const GoogleApiUsage = require('../models/GoogleApiUsage');
const {
  getGoogleTranslateConfig,
  isGoogleTranslateEnabled,
} = require('../config/featureFlags');

// content.lengthと元言語を除いた翻訳先の数を掛け、月次使用量へ加算してから上限を判定する。
// 上限超過でfalseを返した場合も、加算した使用量は戻さない。
const canTranslate = async (content, lang, targetLangs) => {
  try {
    if (!content || !Array.isArray(targetLangs) || targetLangs.length === 0) return false;
    if (!isGoogleTranslateEnabled()) return false;
    const config = getGoogleTranslateConfig();

    const filteredLangs = targetLangs.filter((t) => t !== lang);
    if (filteredLangs.length === 0) return false;

    const charCount = content.length * filteredLangs.length;

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const result = await GoogleApiUsage.findOneAndUpdate(
      { api_type: 'translate', year_month: yearMonth },
      { $inc: { usage: charCount }, year_month: yearMonth },
      { upsert: true, new: true }
    );

    if (config.limit !== null && result.usage > config.limit) return false;

    return true;
  } catch {
    return false;
  }
};

module.exports = { canTranslate };
