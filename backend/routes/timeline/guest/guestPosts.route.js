const express = require('express');
const {
  validateMongoId,
  validateFrom,
  validateTo,
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
const { validateServerQuery } = require('../../../validates/serverQuery.validate');
const { finalize } = require('../../../middlewares/validation');
const guestAuth = require('../../../middlewares/guestAuth');
const guestPostsController = require('../../../controllers/timeline/guest/guestPosts.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/',
    guestAuth,
    [
      validateMongoId('floor_id'),
      validateMongoId('room_id'),
      validateFrom('from'),
      validateTo('to'),
      ...validateServerQuery(),
    ],
    finalize,
    guestPostsController.getPosts
  );

  router.post(
    '/detail',
    guestAuth,
    [validateMongoId('post_id')],
    finalize,
    guestPostsController.getPostDetail
  );

  router.post(
    '/post',
    guestAuth,
    [
      validateMongoId('floor_id'),
      validateTitle('floor_title'),
      validateMongoId('room_id'),
      validateTitle('room_title'),
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
    guestPostsController.createPost
  );

  return router;
};
