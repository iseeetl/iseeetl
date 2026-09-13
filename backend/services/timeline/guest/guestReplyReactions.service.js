const { publishSocketEvent } = require('../../../socket/publication');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../shared/reactionHelpers');

exports.createReplyReaction = async (body, io) => {
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const postId = body.post_id;
  const replyId = body.reply_id;
  const type = body.type;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const reaction = {
    guest_id: guestId,
    guest_name: guestName,
    type,
  };

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'replies._id': replyId, delete_flg: false },
    update: { $push: { 'replies.$.reactions': reaction } },
  });

  await publishSocketEvent('REPLY_REACTION_CREATE', () => io.to(result.room._id).emit('REPLY_REACTION_CREATE', result));

  return result;
};

exports.deleteReplyReaction = async (body, io) => {
  const guestId = body.guest_id;
  const postId = body.post_id;
  const replyId = body.reply_id;
  const reactionId = body.reaction_id;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const foundReply = foundChat.replies.id(replyId);
  if (foundReply) {
    const foundReaction = foundReply.reactions.find((reaction) => reaction._id.toString() === reactionId);
    ensureGuestReactionOwner(foundReaction, guestId);
  } else {
    ensureGuestReactionOwner(null, guestId);
  }

  const result = await updateChatAndPopulate({
    query: { _id: postId, 'replies._id': replyId, delete_flg: false },
    update: { $pull: { 'replies.$.reactions': { _id: reactionId } } },
  });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
