const express = require('express');
const {
  validateMongoId,
  validateTitle,
  validateUUID,
  validateUserName,
  validateContentNotNull,
  validateLang,
  validateRoomTags,
  validateRoomTagItem,
  validateAnimation,
  validateKeyup,
  validateTargetLangs,
} = require('../../../validates/base.validate');
const { finalize } = require('../../../middlewares/validation');
const guestAuth = require('../../../middlewares/guestAuth');
const guestRepliesController = require('../../../controllers/timeline/guest/guestReplies.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/reply',
    guestAuth,
    [
      validateMongoId('floor_id'),
      validateTitle('floor_title'),
      validateMongoId('room_id'),
      validateTitle('room_title'),
      validateMongoId('post_id'),
      validateUUID('guest_id'),
      validateUserName('guest_name'),
      validateContentNotNull('content'),
      validateLang('lang'),
      validateRoomTags('room_tags'),
      validateRoomTagItem('room_tags.*'),
      validateAnimation('animation'),
      validateKeyup('keyup'),
      validateTargetLangs('target_langs'),
    ],
    finalize,
    guestRepliesController.createReply
  );

  return router;
};
