const uploadService = require('../upload.service');

const wrapResult = (result) => ({ result });

async function storeImage({ body, files, jwtPayload }) {
  return wrapResult(await uploadService.uploadTimelineImage(body, files, jwtPayload));
}

async function storeVideo({ body, files, jwtPayload }) {
  return wrapResult(await uploadService.uploadTimelineVideo(body, files, jwtPayload));
}

async function storeAudio({ body, files, jwtPayload }) {
  return wrapResult(await uploadService.uploadTimelineAudio(body, files, jwtPayload));
}

async function discardTimelineMedia({ body, jwtPayload }) {
  return wrapResult(await uploadService.discardTimelineMedia(body, jwtPayload));
}

module.exports = {
  discardTimelineMedia,
  storeAudio,
  storeImage,
  storeVideo,
};
