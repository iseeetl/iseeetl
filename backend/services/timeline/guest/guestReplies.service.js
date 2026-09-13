const AppError = require('../../../utils/appError');
const { runBackgroundTask } = require('../../backgroundTaskRunner');
const { isGoogleTranslateEnabled } = require('../../../config/featureFlags');
const { TIMELINE_POPULATE_WITH_REPLIES } = require('../shared/chatPopulate');

const { findChatOrThrow } = require('../shared/reactionHelpers');
const { ensureChatBelongsToRoom } = require('../shared/roomConsistency');

const { ensureGuestRoomContext } = require('../shared/guestAccess');
const { containsOnlyAllowedEmojis } = require('../shared/guestRules');
const { notifyReplyFilterMatch } = require('../shared/replyNotifications');
const { createTimelineReply } = require('../shared/replyCreate');
const { emitReplyCreate, translateReplyAfterCreate } = require('../shared/replyPostProcess');
const { notifyReplyPostAuthor, notifyReplyRepliers } = require('../shared/replyParticipantNotifications');
const { validateRoomTagsForRoom } = require('../shared/roomTagValidation');

exports.createReply = async (body, io) => {
  const roomId = body.room_id;
  const postId = body.post_id;
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const content = body.content;
  const lang = body.lang;
  const roomTags = body.room_tags;
  const animation = body.animation;
  const targetLangs = body.target_langs;

  const { room: foundRoom, floor: foundFloor } = await ensureGuestRoomContext(roomId, {
    notFound: { code: 'INVALID_PARAMS' },
    memberOnly: { code: 'INVALID_PERMISSION' },
  });

  if (foundRoom.guest_reaction_only && !containsOnlyAllowedEmojis(content)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });

  const foundChat = await findChatOrThrow(postId);
  ensureChatBelongsToRoom(foundChat, foundRoom, 'INVALID_PARAMS');

  const { responseChat, updatedChat, replacedContent } = await createTimelineReply({
    postId,
    content,
    populate: TIMELINE_POPULATE_WITH_REPLIES,
    buildReply: ({ replacedContent: replaced }) => ({
      guest_id: guestId,
      guest_name: guestName,
      content: replaced,
      lang,
      room_tags: roomTags,
      animation,
    }),
  });

  // 投稿者、既存の返信者、通知フィルタの一致者へ通知する。ゲスト本人は対象から除外する。
  await notifyReplyPostAuthor({
    foundChat,
    foundFloor,
    foundRoom,
    senderName: guestName,
    replacedContent,
    logLabel: 'reply-notify (post author)',
  });

  await notifyReplyRepliers({
    foundChat,
    foundFloor,
    foundRoom,
    senderName: guestName,
    replacedContent,
    logLabel: 'guest-reply notify (repliers)',
    buildContents: ({ senderName, snippet }) => ({
      ja: senderName + ': 「' + snippet + '」',
      en: senderName + ': “' + snippet + '”',
    }),
  });

  await notifyReplyFilterMatch({
    roomId: foundRoom._id,
    floorId: foundFloor._id,
    content: replacedContent,
    roomTags,
    username: guestName,
    animation,
    logLabel: 'guest-reply notify (pushfilter)',
  });

  await emitReplyCreate(io, responseChat);

  // 翻訳失敗は返信作成の成否へ影響させない。
  if (isGoogleTranslateEnabled()) {
    runBackgroundTask('timeline.guestReplies.create', () =>
      translateReplyAfterCreate({
        result: responseChat,
        updatedChat,
        targetLangs,
        io,
        actor: { type: 'guest', id: guestId },
      }), { context: { postId: String(responseChat._id) } });
  }

  return responseChat;
};
