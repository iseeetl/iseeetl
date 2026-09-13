const { publishSocketEvent } = require('../../../socket/publication');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../shared/reactionHelpers');

exports.createSupplementReaction = async (body, io) => {
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const postId = body.post_id;
  const supplementId = body.supplement_id;
  const type = body.type;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const reaction = {
    guest_id: guestId,
    guest_name: guestName,
    type,
  };

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'supplementaries._id': supplementId, delete_flg: false },
    update: { $push: { 'supplementaries.$.reactions': reaction } },
  });

  await publishSocketEvent('SUPPLEMENT_REACTION_CREATE', () => io.to(result.room._id).emit('SUPPLEMENT_REACTION_CREATE', result));

  return result;
};

exports.deleteSupplementReaction = async (body, io) => {
  const guestId = body.guest_id;
  const postId = body.post_id;
  const supplementId = body.supplement_id;
  const reactionId = body.reaction_id;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const foundSupplement = foundChat.supplementaries.id(supplementId);
  if (foundSupplement) {
    const foundReaction = foundSupplement.reactions.find((reaction) => reaction._id.toString() === reactionId);
    ensureGuestReactionOwner(foundReaction, guestId);
  } else {
    ensureGuestReactionOwner(null, guestId);
  }

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'supplementaries._id': supplementId, delete_flg: false },
    update: { $pull: { 'supplementaries.$.reactions': { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
