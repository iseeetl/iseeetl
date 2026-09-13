const fsPromises = require('fs').promises;
const archiver = require('archiver');
const AppError = require('../../../utils/appError');
const { resolveMongoIdPath } = require('../../../utils/safePath');
const { ensureRoomBelongsToFloor } = require('./context');

const timelineMedia = async (body) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  await ensureRoomBelongsToFloor(floorId, roomId);

  const dirPath = resolveMongoIdPath(process.env.MEDIA_PATH, [floorId, roomId], {
    createError: () => new AppError({ code: 'INVALID_PARAMS' }),
  });
  await fsPromises.access(dirPath);

  const archive = archiver('zip', { store: true, forceZip64: true });
  archive.directory(dirPath, false);
  return { archive, fileName: 'timeline_media.zip' };
};

module.exports = {
  timelineMedia,
};
