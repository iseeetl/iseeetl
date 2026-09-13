const express = require('express');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const { authorizeTimelineResourceUpload } = require('../../middlewares/authorizeUploadTarget');
const { timelineImageUploader, timelineVideoUploader, timelineAudioUploader, SUBTITLE_LIMIT } = require('../../middlewares/uploaders');
const { requireFiles, requireAnyFile, finalize, cleanupUploadOnError } = require('../../middlewares/validation');
const controller = require('../../controllers/timeline/uploadResource.controller');
const { errors } = require('../../controllers/timeline/resourceOptions');
const AppError = require('../../utils/appError');

module.exports = () => {
  const router = express.Router();
  const base = '/rooms/:room_id/timeline/uploads';
  const authorize = authorizeTimelineResourceUpload({ errors });
  const subtitleSize = (req, _res, next) => req.files?.video_subtitle_file?.[0]?.size > SUBTITLE_LIMIT
    ? next(new AppError({ code: 'FILE_TOO_LARGE' })) : next();
  for (const [kind, uploader, files] of [
    ['Image', timelineImageUploader, requireFiles(['image_file'])],
    ['Video', timelineVideoUploader, requireAnyFile(['video_file', 'video_subtitle_file'])],
    ['Audio', timelineAudioUploader, requireFiles(['audio_file'])],
  ]) {
    router.post(`${base}/${kind.toLowerCase()}`, ensureJsonWebToken, authorize, uploader, subtitleSize, files, finalize, controller.handle(kind), cleanupUploadOnError);
  }
  router.post(`${base}/discard`, ensureJsonWebToken, authorize, controller.discard);
  return router;
};
