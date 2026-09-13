const express = require('express');
const { body } = require('express-validator');

const ensureJsonWebTokenV1 = require('../../middlewares/ensureJsonWebTokenV1');
const ensureDeveloperUserV1 = require('../../middlewares/ensureDeveloperUserV1');
const AppError = require('../../utils/appError');
const { validateMongoId } = require('../../validates/base.validate');
const {
  cleanupUploadOnError,
  finalize,
  requireFiles,
} = require('../../middlewares/validation');
const {
  authorizeV1TimelineUpload,
  requireMatchingUploadBody,
} = require('../../middlewares/authorizeUploadTarget');
const {
  SUBTITLE_LIMIT,
  timelineAudioUploader,
  timelineImageUploader,
  timelineVideoUploader,
} = require('../../middlewares/uploaders');
const { createPostSupplementsController } = require('../../controllers/v1/postSupplements.controller');
const { createPostsController } = require('../../controllers/v1/posts.controller');
const { createRepliesController } = require('../../controllers/v1/replies.controller');
const { createReplySupplementsController } = require('../../controllers/v1/replySupplements.controller');
const { createTimelineController } = require('../../controllers/v1/timeline.controller');
const { createUploadsController } = require('../../controllers/v1/uploads.controller');

const checkSubtitleSize = (req, _res, next) => {
  const subtitle = req.files?.video_subtitle_file?.[0];
  if (subtitle && subtitle.size > SUBTITLE_LIMIT) {
    return next(new AppError({ code: 'FILE_TOO_LARGE' }));
  }
  return next();
};

const v1UploadContext = [
  ensureJsonWebTokenV1,
  ensureDeveloperUserV1,
  authorizeV1TimelineUpload,
];

const v1UploadBodyValidation = [
  requireMatchingUploadBody,
  validateMongoId('floor_id'),
  validateMongoId('room_id'),
];

module.exports = (io) => {
  const router = express.Router();
  const timeline = createTimelineController(io);
  const posts = createPostsController(io);
  const postSupplements = createPostSupplementsController(io);
  const replies = createRepliesController(io);
  const replySupplements = createReplySupplementsController(io);
  const uploads = createUploadsController(io);

  router.get(
    '/timeline/floor/:floor_id/room/:room_id',
    ensureJsonWebTokenV1,
    ensureDeveloperUserV1,
    timeline.listRoom
  );
  router.post('/roomtag', ensureJsonWebTokenV1, ensureDeveloperUserV1, timeline.listRoomTags);

  router.post('/post/create', ensureJsonWebTokenV1, ensureDeveloperUserV1, posts.create);
  router.post('/post/update', ensureJsonWebTokenV1, ensureDeveloperUserV1, posts.update);
  router.post('/post/delete', ensureJsonWebTokenV1, ensureDeveloperUserV1, posts.delete);
  router.post('/post/supplement/create', ensureJsonWebTokenV1, ensureDeveloperUserV1, postSupplements.create);
  router.post('/post/supplement/update', ensureJsonWebTokenV1, ensureDeveloperUserV1, postSupplements.update);
  router.post('/post/supplement/delete', ensureJsonWebTokenV1, ensureDeveloperUserV1, postSupplements.delete);

  router.post('/reply/create', ensureJsonWebTokenV1, ensureDeveloperUserV1, replies.create);
  router.post('/reply/update', ensureJsonWebTokenV1, ensureDeveloperUserV1, replies.update);
  router.post('/reply/delete', ensureJsonWebTokenV1, ensureDeveloperUserV1, replies.delete);
  router.post('/reply/supplement/create', ensureJsonWebTokenV1, ensureDeveloperUserV1, replySupplements.create);
  router.post('/reply/supplement/update', ensureJsonWebTokenV1, ensureDeveloperUserV1, replySupplements.update);
  router.post('/reply/supplement/delete', ensureJsonWebTokenV1, ensureDeveloperUserV1, replySupplements.delete);

  router.post(
    '/upload/image',
    ...v1UploadContext,
    timelineImageUploader,
    ...v1UploadBodyValidation,
    requireFiles(['image_file']),
    finalize,
    uploads.image,
    cleanupUploadOnError
  );
  router.post(
    '/upload/video',
    ...v1UploadContext,
    timelineVideoUploader,
    ...v1UploadBodyValidation,
    checkSubtitleSize,
    requireFiles(['video_file']),
    finalize,
    uploads.video,
    cleanupUploadOnError
  );
  router.post(
    '/upload/audio',
    ...v1UploadContext,
    timelineAudioUploader,
    ...v1UploadBodyValidation,
    requireFiles(['audio_file']),
    finalize,
    uploads.audio,
    cleanupUploadOnError
  );
  router.post(
    '/upload/discard',
    ensureJsonWebTokenV1,
    ensureDeveloperUserV1,
    uploads.ensureDeveloper,
    [
      validateMongoId('floor_id'),
      validateMongoId('room_id'),
      body('file_names').isArray({ min: 1, max: 6 }),
      body('file_names.*').isString(),
    ],
    finalize,
    uploads.discard
  );

  return router;
};
