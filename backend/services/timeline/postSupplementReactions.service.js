const { publishSocketEvent } = require('../../socket/publication');
const AppError = require('../../utils/appError');
const {
  authorizeUserFromChat,
  canDeleteByRole,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('./shared/reactionHelpers');

exports.createSupplementReaction = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const supplementId = body.supplement_id;
  const reactionType = body.type;

  const decodedUserId = jwtPayload.user_id;

  const foundChat = await findChatOrThrow(postId);

  await authorizeUserFromChat(foundChat, jwtPayload);

  const foundSupplement = foundChat.supplementaries.id(supplementId);
  if (!foundSupplement) throw new AppError({ code: 'NOT_FOUND' });

  const exists = foundSupplement.reactions.some(
    (r) => r.user && r.user.toString() === decodedUserId && r.type === reactionType
  );
  if (exists) throw new AppError({ code: 'CONFLICT' });

  const reaction = { user: decodedUserId, type: reactionType };

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'supplementaries._id': supplementId, delete_flg: false },
    update: { $push: { 'supplementaries.$.reactions': reaction } },
  });

  await publishSocketEvent('SUPPLEMENT_REACTION_CREATE', () => io.to(result.room._id).emit('SUPPLEMENT_REACTION_CREATE', result));

  return result;
};

exports.deleteSupplementReaction = async (body, jwtPayload, io) => {
  const postId = body.post_id;
  const supplementId = body.supplement_id;
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
    const foundSupplement = foundChat.supplementaries.id(supplementId);
    if (foundSupplement) {
      const foundReaction = foundSupplement.reactions.id(reactionId);
      if (foundReaction && foundReaction.user && foundReaction.user.toString() === decodedUserId)
        hasDeletePermission = true;
    }
  }
  if (!hasDeletePermission) throw new AppError({ code: 'INVALID_PERMISSION' });

  const foundSupplement = foundChat.supplementaries.id(supplementId);
  if (!foundSupplement) throw new AppError({ code: 'NOT_FOUND' });

  const foundReaction = foundSupplement.reactions.id(reactionId);
  if (!foundReaction) throw new AppError({ code: 'NOT_FOUND' });

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'supplementaries._id': supplementId, delete_flg: false },
    update: { $pull: { 'supplementaries.$.reactions': { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
