const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const { validateReactionType } = require('../../validates/reaction.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const controller = require('../../controllers/timeline/replyReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reply/reaction',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateReactionType('type'),
    ],
    finalize,
    controller.create
  );

  router.post(
    '/reply/reaction/delete',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('reply_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    controller.delete
  );

  return router;
};
