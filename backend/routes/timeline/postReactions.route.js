const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const { validateReactionType } = require('../../validates/reaction.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const postReactionsController = require('../../controllers/timeline/postReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reaction',
    ensureJsonWebToken,
    [validateMongoId('post_id'), validateReactionType('type')],
    finalize,
    postReactionsController.createReaction
  );

  router.post(
    '/reaction/delete',
    ensureJsonWebToken,
    [validateMongoId('post_id'), validateMongoId('reaction_id')],
    finalize,
    postReactionsController.deleteReaction
  );

  return router;
};
