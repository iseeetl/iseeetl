const express = require('express');
const guestAuth = require('../../../middlewares/guestAuth');
const { validateUUID, validateUserName, validateMongoId } = require('../../../validates/base.validate');
const { validateReactionType } = require('../../../validates/reaction.validate');
const { finalize } = require('../../../middlewares/validation');
const guestPostReactionsController = require('../../../controllers/timeline/guest/guestPostReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reaction',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateReactionType('type'),
    ],
    finalize,
    guestPostReactionsController.createReaction
  );

  router.post(
    '/reaction/delete',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    guestPostReactionsController.deleteReaction
  );

  return router;
};
