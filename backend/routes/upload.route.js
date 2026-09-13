const express = require('express');
const router = express.Router();

const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const { validateMongoId } = require('../validates/base.validate');
const {
  cleanupUploadOnError,
  requireFiles,
  finalize,
} = require('../middlewares/validation');
const uploadController = require('../controllers/upload.controller');
const {
  authorizeFloorImageUpload,
  authorizeRoomImageUpload,
  requireMatchingUploadBody,
} = require('../middlewares/authorizeUploadTarget');
const {
  profileImageUploader,
  floorImageUploader,
  roomImageUploader,
} = require('../middlewares/uploaders');

router.post(
  '/profile/image',
  ensureJsonWebToken,
  profileImageUploader,
  requireFiles(['image_file']),
  finalize,
  uploadController.uploadProfileImage,
  cleanupUploadOnError
);

router.post(
  '/floor/image',
  ensureJsonWebToken,
  authorizeFloorImageUpload,
  floorImageUploader,
  requireMatchingUploadBody,
  [validateMongoId('_id')],
  requireFiles(['image_file']),
  finalize,
  uploadController.uploadFloorImage,
  cleanupUploadOnError
);

router.post(
  '/room/image',
  ensureJsonWebToken,
  authorizeRoomImageUpload,
  roomImageUploader,
  requireMatchingUploadBody,
  [validateMongoId('floor_id'), validateMongoId('_id')],
  requireFiles(['image_file']),
  finalize,
  uploadController.uploadRoomImage,
  cleanupUploadOnError
);

module.exports = router;
