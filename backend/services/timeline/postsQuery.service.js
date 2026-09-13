const AppError = require('../../utils/appError');
const serializeTimeline = require('./shared/timelineSerializer');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');
const { TIMELINE_POPULATE_WITH_REACTIONS } = require('./shared/chatPopulate');
const { listTimelineChats } = require('./shared/timelineList');

const { findActiveChatOrThrow } = require('./shared/postContext');

const idsMatch = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();

exports.list = async (body, jwtPayload, { errors } = {}) => {
  const roomId = body.room_id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const { foundRoom, foundFloor } = await authorizeRoomAccess(
    decodedUserId,
    decodedUserRole,
    roomId,
    { errors }
  );

  if (body.floor_id !== undefined && !idsMatch(foundFloor._id, body.floor_id)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }

  return listTimelineChats({
    body: {
      ...body,
      floor_id: foundFloor._id,
      room_id: foundRoom._id,
    },
    populate: TIMELINE_POPULATE_WITH_REACTIONS,
  });
};

exports.detail = async (body, jwtPayload, { errors } = {}) => {
  const postId = body.post_id;
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;
  if (body.room_id) await authorizeRoomAccess(decodedUserId, decodedUserRole, body.room_id, { errors });

  const foundChat = await findActiveChatOrThrow(postId, {
    roomId: body.room_id,
    populate: TIMELINE_POPULATE_WITH_REACTIONS,
    error: errors?.post || { code: 'NOT_FOUND_POST' },
  });

  // 要求にルームIDがなければ、取得した投稿の所属先でアクセス権を確認する。
  if (!body.room_id) await authorizeRoomAccess(decodedUserId, decodedUserRole, foundChat.room.toString());

  return serializeTimeline(foundChat);
};
