const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  authorizeUserFromChat,
  canDeleteByRole,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('./shared/reactionHelpers');

exports.create = async (body, jwtPayload, io) => {
  const { post_id, reply_id, supplement_id, type } = body;
  const decodedUserId = jwtPayload.user_id;

  const foundChat = await findChatOrThrow(post_id);

  await authorizeUserFromChat(foundChat, jwtPayload);

  const result = await updateChatAndPopulate({
    query: { _id: post_id, delete_flg: false },
    update: {
      $push: {
        'replies.$[reply].supplementaries.$[supplement].reactions': {
          user: decodedUserId,
          type,
        },
      },
    },
    options: { arrayFilters: [{ 'reply._id': reply_id }, { 'supplement._id': supplement_id }] },
  });

  await publishSocketEvent('REPLY_SUPPLEMENT_REACTION_CREATE', () => io.to(result.room._id).emit('REPLY_SUPPLEMENT_REACTION_CREATE', result));

  return result;
};

exports.delete = async (body, jwtPayload, io) => {
  const { post_id, reply_id, supplement_id, reaction_id } = body;
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const foundChat = await findChatOrThrow(post_id);

  const { foundFloor, foundFloorMember } = await authorizeUserFromChat(foundChat, jwtPayload);

  let hasPermission = canDeleteByRole({
    role: decodedUserRole,
    floor: foundFloor,
    floorMember: foundFloorMember,
    userId: decodedUserId,
  });
  if (!hasPermission) {
    const reply = foundChat.replies.id(reply_id);
    if (reply) {
      const supp = reply.supplementaries.id(supplement_id);
      if (supp) {
        const react = supp.reactions.id(reaction_id);
        if (react && react.user && react.user.toString() === decodedUserId) hasPermission = true;
      }
    }
  }

  if (!hasPermission) throw new AppError({ code: 'INVALID_PERMISSION' });

  const result = await updateChatAndPopulate({
    query: { _id: post_id, delete_flg: false },
    update: {
      $pull: {
        'replies.$[reply].supplementaries.$[supplement].reactions': { _id: reaction_id },
      },
    },
    options: { arrayFilters: [{ 'reply._id': reply_id }, { 'supplement._id': supplement_id }] },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
