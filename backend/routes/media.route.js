const express = require('express');
const path = require('path');

const AppError = require('../utils/appError');
const roomMediaAccess = require('../middlewares/roomMediaAccess');
const { setStaticMediaHeaders } = require('../utils/staticMediaHeaders');
const { isMongoId, resolveMongoIdPath } = require('../utils/safePath');

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.mp4',
  '.ogv',
  '.webm',
  '.mov',
  '.srt',
  '.vtt',
  '.mp3',
]);

const isSafeMediaFileName = (fileName) =>
  typeof fileName === 'string' &&
  fileName.length > 0 &&
  fileName.length <= 255 &&
  path.basename(fileName) === fileName &&
  ALLOWED_MEDIA_EXTENSIONS.has(path.extname(fileName).toLowerCase());

module.exports = ({ mediaRoot }) => {
  const router = express.Router();

  router.get('/:floorId/:roomId/:fileName', roomMediaAccess, (req, res, next) => {
    const { floorId, roomId, fileName } = req.params;
    if (!isMongoId(floorId) || !isMongoId(roomId) || !isSafeMediaFileName(fileName)) {
      return next(new AppError({ code: 'NOT_FOUND' }));
    }

    let root;
    try {
      root = resolveMongoIdPath(mediaRoot, [floorId, roomId], {
        createError: () => new AppError({ code: 'NOT_FOUND' }),
      });
    } catch (error) {
      return next(error);
    }
    setStaticMediaHeaders(res);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(fileName, { root, dotfiles: 'deny', acceptRanges: true }, (error) => {
      if (!error) return;
      if (error.status === 404 || error.code === 'ENOENT') {
        return next(new AppError({ code: 'NOT_FOUND' }));
      }
      return next(error);
    });
  });

  // ルーム配下の想定外の深いパスを、後続の静的配信へ渡さない。
  router.use('/:floorId/:roomId', (req, _res, next) => {
    if (isMongoId(req.params.floorId) && isMongoId(req.params.roomId)) {
      return next(new AppError({ code: 'NOT_FOUND' }));
    }
    return next();
  });

  return router;
};
