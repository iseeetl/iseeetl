const express = require('express');
const guestAuth = require('../../../middlewares/guestAuth');
const { validateUUID, validateUserName, validateMongoId } = require('../../../validates/base.validate');
const { validateReactionType } = require('../../../validates/reaction.validate');
const { finalize } = require('../../../middlewares/validation');
const guestReplyReactionsController = require('../../../controllers/timeline/guest/guestReplyReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reply/reaction',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateReactionType('type'),
    ],
    finalize,
    guestReplyReactionsController.createReplyReaction
  );

  router.post(
    '/reply/reaction/delete',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    guestReplyReactionsController.deleteReplyReaction
  );

  return router;
};
