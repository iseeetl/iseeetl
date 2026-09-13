const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const { validateReactionType } = require('../../validates/reaction.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const controller = require('../../controllers/timeline/replySupplementReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reply/supplement/reaction',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateMongoId('supplement_id'),
      validateReactionType('type'),
    ],
    finalize,
    controller.create
  );

  router.post(
    '/reply/supplement/reaction/delete',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateMongoId('supplement_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    controller.delete
  );

  return router;
};
