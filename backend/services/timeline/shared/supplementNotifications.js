const User = require('../../../models/User.js');
const { getApplicationConfig } = require('../../../config/application');
const { dispatchPushNotification } = require('./notificationSender');
const { buildSnippet, notifyPushFilterUsers } = require('./pushFilterNotification');
const { buildUrl } = require('./notificationUtils');
const NOTIFICATION_MESSAGES = require('../../../constants/notificationMessages');

const warnNotificationError = (logger, logPrefix, error) => {
  if (logger && logPrefix) {
    logger.warn(`[OneSignal] ${logPrefix} error:`, error);
  }
};

async function notifySupplementAuthor({
  authorId,
  excludeUserId,
  senderName,
  content,
  floorId,
  roomId,
  headings,
  userQuery = {},
  logger,
  logPrefix,
}) {
  try {
    if (!authorId || authorId === excludeUserId) return;

    const author = await User.findOne({ _id: authorId, push_enabled: true, ...userQuery }).select('_id');
    if (!author) return;

    const snippet = buildSnippet(content);
    const contents = NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName, snippet });
    await dispatchPushNotification({
      userIds: [author._id.toString()],
      roomId,
      headings,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, floorId, roomId),
    });
  } catch (e) {
    warnNotificationError(logger, logPrefix, e);
  }
}

async function notifySupplementPushFilter({
  roomId,
  floorId,
  senderName,
  content,
  excludeUserId,
  headings,
  logger,
  logPrefix,
}) {
  try {
    const msgInfo = {
      room_tags: [],
      content: content || '',
      username: senderName,
      animation: false,
    };
    const snippet = buildSnippet(content);
    const contents = NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName, snippet });
    await notifyPushFilterUsers({
      roomId: roomId.toString(),
      msgInfo,
      excludeUserId,
      headings,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, floorId, roomId),
    });
  } catch (e) {
    warnNotificationError(logger, logPrefix, e);
  }
}

module.exports = {
  notifySupplementAuthor,
  notifySupplementPushFilter,
};
