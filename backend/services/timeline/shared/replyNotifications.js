const logger = require('../../../utils/logger');
const { getApplicationConfig } = require('../../../config/application');
const { buildSnippet, notifyPushFilterUsers } = require('./pushFilterNotification');
const { buildUrl, normalizeId } = require('./notificationUtils');
const NOTIFICATION_MESSAGES = require('../../../constants/notificationMessages');

async function notifyReplyFilterMatch({
  roomId,
  floorId,
  content,
  roomTags,
  username,
  animation,
  excludeUserId,
  logLabel = 'reply-notify (pushfilter)',
}) {
  try {
    const msgInfo = {
      room_tags: roomTags,
      content: content || '',
      username,
      animation: animation !== null,
    };
    const snippet = buildSnippet(content || '');
    const contents = NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.COMPACT({ senderName: username, snippet });
    return await notifyPushFilterUsers({
      roomId: normalizeId(roomId),
      msgInfo,
      excludeUserId,
      headings: NOTIFICATION_MESSAGES.REPLY_FILTER_MATCH,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, floorId, roomId),
    });
  } catch (e) {
    logger.warn(`[OneSignal] ${logLabel} error:`, e);
    return [];
  }
}

module.exports = {
  notifyReplyFilterMatch,
};
