const express = require('express');
const router = express.Router();
const { validateMongoId } = require('../validates/base.validate');
const { validateSoundTags } = require('../validates/tag.validate');
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const soundTagController = require('../controllers/soundTag.controller');

// 音を鳴らすタグの選択を解除するときは、更新APIにtags: []を指定する。
router.post(
  '/',
  ensureJsonWebToken,
  [validateMongoId('floor_id'), validateMongoId('room_id')],
  finalize,
  soundTagController.getSoundTag
);

router.post(
  '/create',
  ensureJsonWebToken,
  [
    validateMongoId('floor_id'),
    validateMongoId('room_id'),
    validateSoundTags('tags'),
    validateMongoId('tags.*'),
  ],
  finalize,
  soundTagController.createSoundTag
);

router.post(
  '/update',
  ensureJsonWebToken,
  [
    validateMongoId('_id'),
    validateSoundTags('tags'),
    validateMongoId('tags.*'),
  ],
  finalize,
  soundTagController.updateSoundTag
);

module.exports = router;
