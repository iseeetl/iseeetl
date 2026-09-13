const express = require('express');
const guestAuth = require('../../../middlewares/guestAuth');
const { validateUUID, validateUserName, validateMongoId } = require('../../../validates/base.validate');
const { validateReactionType } = require('../../../validates/reaction.validate');
const { finalize } = require('../../../middlewares/validation');
const guestReplySupplementReactionsController = require('../../../controllers/timeline/guest/guestReplySupplementReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reply/supplement/reaction',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateMongoId('supplement_id'),
      validateReactionType('type'),
    ],
    finalize,
    guestReplySupplementReactionsController.createReplySupplementReaction
  );

  router.post(
    '/reply/supplement/reaction/delete',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('supplement_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    guestReplySupplementReactionsController.deleteReplySupplementReaction
  );

  return router;
};
