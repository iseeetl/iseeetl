const { publishSocketEvent } = require('../../../socket/publication');
const {
  authorizeGuestFromChat,
  ensureGuestReactionOwner,
  findChatOrThrow,
  updateChatAndPopulate,
} = require('../shared/reactionHelpers');

exports.createReplySupplementReaction = async (body, io) => {
  const guestId = body.guest_id;
  const guestName = body.guest_name;
  const postId = body.post_id;
  const replyId = body.reply_id;
  const supplementId = body.supplement_id;
  const type = body.type;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const reaction = {
    guest_id: guestId,
    guest_name: guestName,
    type,
  };

  const query = { _id: postId, delete_flg: false };
  const update = {
    $push: {
      'replies.$[reply].supplementaries.$[supplement].reactions': reaction,
    },
  };
  const options = {
    arrayFilters: [{ 'reply._id': replyId }, { 'supplement._id': supplementId }],
  };
  const result = await updateChatAndPopulate({ query, update, options });

  await publishSocketEvent('REPLY_SUPPLEMENT_REACTION_CREATE', () => io.to(result.room._id).emit('REPLY_SUPPLEMENT_REACTION_CREATE', result));

  return result;
};

exports.deleteReplySupplementReaction = async (body, io) => {
  const guestId = body.guest_id;
  const postId = body.post_id;
  const replyId = body.reply_id;
  const supplementId = body.supplement_id;
  const reactionId = body.reaction_id;

  const foundChat = await findChatOrThrow(postId);
  await authorizeGuestFromChat(foundChat);

  const foundReply = foundChat.replies.id(replyId);
  if (foundReply) {
    const foundSupplement = foundReply.supplementaries.id(supplementId);
    if (foundSupplement) {
      const foundReaction = foundSupplement.reactions.id(reactionId);
      ensureGuestReactionOwner(foundReaction, guestId);
    } else {
      ensureGuestReactionOwner(null, guestId);
    }
  } else {
    ensureGuestReactionOwner(null, guestId);
  }

  const query = { _id: postId, delete_flg: false };
  const update = {
    $pull: { 'replies.$[reply].supplementaries.$[supplement].reactions': { _id: reactionId } },
  };
  const options = {
    arrayFilters: [{ 'reply._id': replyId }, { 'supplement._id': supplementId }],
  };
  const result = await updateChatAndPopulate({ query, update, options });

  await publishSocketEvent('REACTION_DELETE', () => io.to(result.room._id).emit('REACTION_DELETE', result));

  return result;
};
