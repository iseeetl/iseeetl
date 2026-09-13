const logger = require('../../../utils/logger');
const User = require('../../../models/User');
const { getApplicationConfig } = require('../../../config/application');
const { dispatchPushNotification } = require('./notificationSender');
const { buildSnippet } = require('./pushFilterNotification');
const { buildUrl } = require('./notificationUtils');
const NOTIFICATION_MESSAGES = require('../../../constants/notificationMessages');

async function notifyReplyPostAuthor({
  foundChat,
  foundFloor,
  foundRoom,
  senderName,
  replacedContent,
  excludeUserId,
  logLabel = 'reply-notify (post author)',
}) {
  try {
    const postAuthorId = foundChat?.user ? foundChat.user.toString() : null;
    if (!postAuthorId) return;
    if (excludeUserId && postAuthorId === excludeUserId) return;

    const author = await User.findOne({
      _id: postAuthorId,
      push_enabled: true,
      reply_push_enabled: true,
    }).select('_id');

    if (!author) return;

    const snippet = buildSnippet(replacedContent);
    const contents = NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.DEFAULT({ senderName, snippet });
    await dispatchPushNotification({
      userIds: [author._id.toString()],
      roomId: foundRoom?._id,
      headings: NOTIFICATION_MESSAGES.REPLY_POST_AUTHOR,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, foundFloor?._id, foundRoom?._id),
    });
  } catch (e) {
    logger.warn(`[OneSignal] ${logLabel} error:`, e);
  }
}

async function notifyReplyRepliers({
  foundChat,
  foundFloor,
  foundRoom,
  senderName,
  replacedContent,
  excludeUserId,
  buildContents,
  logLabel = 'reply-notify (repliers)',
}) {
  try {
    // 投稿者への重複通知と自分への通知を避けるため、投稿者と今回の返信者を通知先から除く。
    const replierIds = new Set();

    const isGuestPost = !foundChat?.user;
    const postOwnerId = foundChat?.user ? foundChat.user.toString() : null;

    (foundChat?.replies || []).forEach((r) => {
      if (!r?.user) return;
      const uid = r.user.toString();
      if (excludeUserId && uid === excludeUserId) return;
      if (!isGuestPost && postOwnerId && uid === postOwnerId) return;
      replierIds.add(uid);
    });

    if (!replierIds.size) return;

    const users = await User.find({
      _id: { $in: Array.from(replierIds) },
      push_enabled: true,
      replied_post_push_enabled: true,
    }).select('_id');

    if (!users.length) return;

    const extIds = users.map((u) => u._id.toString());
    const snippet = buildSnippet(replacedContent);
    const contents = buildContents
      ? buildContents({ senderName, snippet })
      : NOTIFICATION_MESSAGES.CONTENT_TEMPLATES.COMPACT({ senderName, snippet });

    await dispatchPushNotification({
      userIds: extIds,
      roomId: foundRoom?._id,
      headings: NOTIFICATION_MESSAGES.REPLY_REPLIERS,
      contents,
      url: buildUrl(getApplicationConfig().appUrl, foundFloor?._id, foundRoom?._id),
    });
  } catch (e) {
    logger.warn(`[OneSignal] ${logLabel} error:`, e);
  }
}

module.exports = {
  notifyReplyPostAuthor,
  notifyReplyRepliers,
};
