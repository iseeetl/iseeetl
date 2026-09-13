const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  authorizeUserFromChat,
  canDeleteByRole,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('./shared/reactionHelpers');

exports.create = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const replyId = body.reply_id;
  const reactionType = body.type;

  const decodedUserId = jwtPayload.user_id;

  const foundChat = await findChatOrThrow(postId);

  await authorizeUserFromChat(foundChat, jwtPayload);

  const reaction = { user: decodedUserId, type: reactionType };

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'replies._id': replyId, delete_flg: false },
    update: { $push: { 'replies.$.reactions': reaction } },
  });

  await publishSocketEvent('REPLY_REACTION_CREATE', () => io.to(result.room._id).emit('REPLY_REACTION_CREATE', result));

  return result;
};

exports.delete = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const replyId = body.reply_id;
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
    const reply = foundChat.replies.id(replyId);
    if (reply) {
      const reaction = reply.reactions.id(reactionId);
      if (reaction && reaction.user !== null && reaction.user.toString() === decodedUserId) hasDeletePermission = true;
    }
  }
  if (!hasDeletePermission) throw new AppError({ code: 'INVALID_PERMISSION' });

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'replies._id': replyId, delete_flg: false },
    update: { $pull: { 'replies.$.reactions': { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
