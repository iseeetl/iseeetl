const uploadAdapter = require('../../services/v1/uploads.adapter');
const { assertDeveloper } = require('../../services/v1/common');
const { createJsonHandler, normalizeError } = require('./base.controller');

function ensureDeveloper(req, _res, next) {
  try {
    assertDeveloper(req.jwtPayload || {});
    next();
  } catch (error) {
    next(normalizeError(error));
  }
}

function createUploadsController(io) {
  return {
    ensureDeveloper,
    image: createJsonHandler(uploadAdapter.storeImage, io),
    video: createJsonHandler(uploadAdapter.storeVideo, io),
    audio: createJsonHandler(uploadAdapter.storeAudio, io),
    discard: createJsonHandler(uploadAdapter.discardTimelineMedia, io),
  };
}

module.exports = { createUploadsController };
