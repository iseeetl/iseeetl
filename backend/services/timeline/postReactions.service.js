const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  authorizeUserFromChat,
  canDeleteByRole,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('./shared/reactionHelpers');

exports.createReaction = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const type = body.type;

  const decodedUserId = jwtPayload.user_id;

  const foundChat = await findChatOrThrow(postId);

  await authorizeUserFromChat(foundChat, jwtPayload);

  const exists = foundChat.reactions.some((r) => r.user && r.user.toString() === decodedUserId && r.type === type);
  if (exists) throw new AppError({ code: 'CONFLICT' });

  const reaction = { user: decodedUserId, type };

  const result = await updateChatAndPopulate({
    query: { _id: postId, delete_flg: false },
    update: { $push: { reactions: reaction } },
  });

  await publishSocketEvent('REACTION_CREATE', () => io.to(result.room._id).emit('REACTION_CREATE', result));

  return result;
};

exports.deleteReaction = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const reactionId = body.reaction_id;

  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const foundChat = await findChatOrThrow(postId);

  const { foundFloor, foundFloorMember } = await authorizeUserFromChat(foundChat, jwtPayload);

  let hasDeletePermission = canDeleteByRole({
    role: decodedUserRole,
    floor: foundFloor,
    floorMember: foundFloorMember,
    userId: decodedUserId,
  });
  if (!hasDeletePermission) {
    const foundReaction = foundChat.reactions.find((r) => r._id.toString() === reactionId);
    if (foundReaction && foundReaction.user !== null && foundReaction.user.toString() === decodedUserId) {
      hasDeletePermission = true;
    }
  }
  if (!hasDeletePermission) throw new AppError({ code: 'INVALID_PERMISSION' });

  const foundReaction = foundChat.reactions.find((r) => r._id.toString() === reactionId);
  if (!foundReaction) throw new AppError({ code: 'NOT_FOUND' });

  const result = await updateChatAndPopulate({
    query: { _id: postId, delete_flg: false },
    update: { $pull: { reactions: { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
