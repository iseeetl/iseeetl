const express = require('express');
const guestAuth = require('../../../middlewares/guestAuth');
const { validateUUID, validateUserName, validateMongoId } = require('../../../validates/base.validate');
const { validateReactionType } = require('../../../validates/reaction.validate');
const { finalize } = require('../../../middlewares/validation');
const guestPostSupplementReactionsController = require('../../../controllers/timeline/guest/guestPostSupplementReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/supplement/reaction',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('supplement_id'),
      validateReactionType('type'),
    ],
    finalize,
    guestPostSupplementReactionsController.createSupplementReaction
  );

  router.post(
    '/supplement/reaction/delete',
    guestAuth,
    [
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateMongoId('post_id'),
      validateMongoId('supplement_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    guestPostSupplementReactionsController.deleteSupplementReaction
  );

  return router;
};
