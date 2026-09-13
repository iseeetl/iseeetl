const AppError = require('../../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../../config/featureFlags');
const serializeTimeline = require('../shared/timelineSerializer');

const Chat = require('../../../models/Chat');
const { findActiveRoom } = require('../../_shared/activeResource');
const { findChatOrThrow } = require('../shared/reactionHelpers');

const { replaceSpams } = require('../../../services/spam.service');
const { TIMELINE_POPULATE_WITH_REACTIONS, TIMELINE_POPULATE_WITH_REPLIES } = require('../shared/chatPopulate');
const { listTimelineChats } = require('../shared/timelineList');
const { ensureGuestRoomContext } = require('../shared/guestAccess');
const { containsOnlyAllowedEmojis } = require('../shared/guestRules');
const { emitPostCreate, notifyPostFilterMatch } = require('../shared/postNotifications');
const { validateRoomTagsForRoom } = require('../shared/roomTagValidation');
const { translateGuestMainContentIfNeeded } = require('../../../services/timeline/timelineTranslation.service');
const { runBackgroundTask } = require('../../backgroundTaskRunner');

exports.getPosts = async (body) => {
  const roomId = body.room_id;
  await ensureGuestRoomContext(roomId, {
    notFound: { code: 'NOT_FOUND' },
    memberOnly: { code: 'FORBIDDEN' },
  });

  return listTimelineChats({ body, populate: TIMELINE_POPULATE_WITH_REACTIONS });
};

exports.getPostDetail = async (body) => {
  const postId = body.post_id;

  let foundChat = null;
  try {
    foundChat = await findChatOrThrow(postId);
    await foundChat.populate(TIMELINE_POPULATE_WITH_REPLIES);
  } catch (err) {
    if (err instanceof AppError) return null;
    throw err;
  }

  await ensureGuestRoomContext(foundChat.room.toString(), {
    notFound: { code: 'INVALID_PARAMS' },
    memberOnly: { code: 'INVALID_PERMISSION' },
  });

  const result = serializeTimeline(foundChat);

  return result;
};

exports.createPost = async (body, io) => {
  const roomId = body.room_id;
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const content = body.content;
  const lang = body.lang;
  const roomTags = body.room_tags;
  const animation = body.animation;
  const targetLangs = body.target_langs;

  const foundRoom = await findActiveRoom(roomId, { error: { code: 'INVALID_PARAMS' } });

  if (foundRoom.guest_reaction_only && !containsOnlyAllowedEmojis(content)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }

  const { floor: foundFloor } = await ensureGuestRoomContext(roomId, {
    roomDoc: foundRoom,
    notFound: { code: 'INVALID_PARAMS' },
    memberOnly: { code: 'INVALID_PERMISSION' },
  });
  await validateRoomTagsForRoom(roomTags, { floorId: foundFloor._id, roomId: foundRoom._id });

  const replacedContent = await replaceSpams(content || '');

  const newPostData = {
    floor: foundFloor._id,
    room: foundRoom._id,
    guest_id: guestId,
    guest_name: guestName,
    content: replacedContent,
    lang,
    room_tags: roomTags,
    animation,
    analysis_source_revision: 1,
  };

  const createdChat = await Chat.create(newPostData);
  const result = serializeTimeline(createdChat);

  await notifyPostFilterMatch({
    roomId: foundRoom._id,
    floorId: foundFloor._id,
    content: replacedContent,
    roomTags,
    username: guestName,
    animation,
  });

  await emitPostCreate(io, result);

  if (isGoogleTranslateEnabled()) {
    runBackgroundTask(
      'timeline.guestPosts.create',
      () =>
        translateGuestMainContentIfNeeded({
          guestId,
          chatId: result._id,
          content: replacedContent,
          lang,
          targetLangs,
          io,
        }),
      { context: { postId: String(result._id), guestId: String(guestId) } }
    );
  }

  return result;
};
