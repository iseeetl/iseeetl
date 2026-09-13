const logger = require('../utils/logger');

// 配信先の取得と通知用データの生成も、保存済み操作から分離する。
async function publishSocketEvent(event, publish) {
  try {
    return await publish();
  } catch (_error) {
    // 例外や送信データには利用者データが含まれ得るため記録しない。
    logger.warn('[SOCKET] publication failed', { event });
    return undefined;
  }
}

module.exports = { publishSocketEvent };
