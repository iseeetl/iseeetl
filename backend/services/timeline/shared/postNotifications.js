const logger = require('../../../utils/logger');
const { publishSocketEvent } = require('../../../socket/publication');
const { getApplicationConfig } = require('../../../config/application');
const { buildSnippet, notifyPushFilterUsers } = require('./pushFilterNotification');
const { buildUrl, normalizeId } = require('./notificationUtils');
const NOTIFICATION_MESSAGES = require('../../../constants/notificationMessages');

async function notifyPostFilterMatch({
  roomId,
  floorId,
  content,
  roomTags,
  username,
  animation,
  excludeUserId,
}) {
  try {
    const msgInfo = {
      room_tags: roomTags,
      content: content || '',
      username,
      animation: animation !== null,
    };
    const snippet = buildSnippet(content || '');
    const contents = NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName: username, snippet });
    await notifyPushFilterUsers({
      roomId: normalizeId(roomId),
      msgInfo,
      excludeUserId,
      headings: NOTIFICATION_MESSAGES.POST_FILTER_MATCH,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, floorId, roomId),
    });
  } catch (e) {
    logger.warn('[OneSignal] post-notify error:', e);
  }
}

function emitPostCreate(io, post) {
  return publishSocketEvent('POST_CREATE', () => {
    if (!io) return;
    return io.to(normalizeId(post?.room?._id || post?.room)).emit('POST_CREATE', post);
  });
}

module.exports = {
  notifyPostFilterMatch,
  emitPostCreate,
};
