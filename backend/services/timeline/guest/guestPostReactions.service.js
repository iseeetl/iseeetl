const { publishSocketEvent } = require('../../../socket/publication');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../shared/reactionHelpers');

exports.createReaction = async (body, io) => {
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const postId = body.post_id;
  const type = body.type;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const reaction = {
    guest_id: guestId,
    guest_name: guestName,
    type,
  };

  const result = await updateChatAndPopulate({
    query: { _id: postId, delete_flg: false },
    update: { $push: { reactions: reaction } },
  });

  await publishSocketEvent('REACTION_CREATE', () => io.to(result.room._id).emit('REACTION_CREATE', result));

  return result;
};

exports.deleteReaction = async (body, io) => {
  const guestId = body.guest_id;
  const postId = body.post_id;
  const reactionId = body.reaction_id;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const foundReaction = foundChat.reactions.find((reaction) => reaction._id.toString() === reactionId);
  ensureGuestReactionOwner(foundReaction, guestId);

  const result = await updateChatAndPopulate({
    query: { _id: postId, delete_flg: false },
    update: { $pull: { reactions: { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
