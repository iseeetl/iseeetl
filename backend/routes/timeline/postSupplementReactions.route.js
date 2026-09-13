const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const { validateReactionType } = require('../../validates/reaction.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const controller = require('../../controllers/timeline/postSupplementReactions.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/supplement/reaction',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('supplement_id'),
      validateReactionType('type'),
    ],
    finalize,
    controller.createSupplementReaction
  );

  router.post(
    '/supplement/reaction/delete',
    ensureJsonWebToken,
    [
      validateMongoId('post_id'),
      validateMongoId('supplement_id'),
      validateMongoId('reaction_id'),
    ],
    finalize,
    controller.deleteSupplementReaction
  );

  return router;
};
