const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/appError');
const { isMongoId, resolveMongoIdPath } = require('../utils/safePath');
const { createMediaBaseName } = require('../services/upload/mediaFileName');

const {
  IMAGE_LIMIT,
  VIDEO_LIMIT,
  AUDIO_LIMIT,
  SUBTITLE_LIMIT,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  VIDEO_EXTENSIONS,
  SUBTITLE_MIME_TYPES,
  SUBTITLE_EXTENSIONS,
  AUDIO_MIME_TYPES,
} = require('../constants/uploads');

const MEDIA_PATH = process.env.MEDIA_PATH;
const ID_FIELD_SIZE_LIMIT = 256;

function resolveSafeUploadDir(baseDir, segments) {
  return resolveMongoIdPath(baseDir, segments, {
    createError: () => new AppError({ code: 'INVALID_PARAMS' }),
  });
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function filenameBuilder(req, file, cb) {
  const userId = req?.jwtPayload?.user_id;
  if (!isMongoId(userId)) {
    return cb(new AppError({ code: 'INVALID_PARAMS' }));
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  return cb(null, `${createMediaBaseName(userId)}${ext}`);
}

// 画像は内容検証・再エンコードが完了するまで公開領域へ書き込まない。
const imageMemoryStorage = multer.memoryStorage();

// 認可済みのフロア・ルームIDを使い、MEDIA_PATH配下の対応するディレクトリへ保存する。
const timelineStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const dir = resolveSafeUploadDir(MEDIA_PATH, [
        req?.uploadTarget?.floorId,
        req?.uploadTarget?.roomId,
      ]);
      ensureDirSync(dir);
      return cb(null, dir);
    } catch (err) {
      return cb(err);
    }
  },
  filename: filenameBuilder,
});

const imageMimes = new Set(IMAGE_MIME_TYPES);
const audioMimes = new Set(AUDIO_MIME_TYPES);
const videoMimes = new Set(VIDEO_MIME_TYPES);
const subtitleMimes = new Set(SUBTITLE_MIME_TYPES);

const imageFilter = (_req, file, cb) => (imageMimes.has(file.mimetype) ? cb(null, true) : cb(null, false));
const audioFilter = (_req, file, cb) => {
  const main = (file.mimetype || '').split(';')[0];
  audioMimes.has(main) ? cb(null, true) : cb(null, false);
};
const videoOrSubtitleFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.fieldname === 'video_file') {
    return cb(null, videoMimes.has(file.mimetype) && VIDEO_EXTENSIONS.includes(ext));
  }
  if (file.fieldname === 'video_subtitle_file') {
    return cb(null, subtitleMimes.has(file.mimetype) && SUBTITLE_EXTENSIONS.includes(ext));
  }
  cb(null, false);
};

exports.profileImageUploader = multer({
  storage: imageMemoryStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 0, parts: 2 },
  fileFilter: imageFilter,
}).fields([{ name: 'image_file', maxCount: 1 }]);

exports.floorImageUploader = multer({
  storage: imageMemoryStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 1, parts: 3, fieldSize: ID_FIELD_SIZE_LIMIT },
  fileFilter: imageFilter,
}).fields([{ name: 'image_file', maxCount: 1 }]);

exports.roomImageUploader = multer({
  storage: imageMemoryStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 2, parts: 4, fieldSize: ID_FIELD_SIZE_LIMIT },
  fileFilter: imageFilter,
}).fields([{ name: 'image_file', maxCount: 1 }]);

exports.timelineImageUploader = multer({
  storage: imageMemoryStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 2, parts: 4, fieldSize: ID_FIELD_SIZE_LIMIT },
  fileFilter: imageFilter,
}).fields([{ name: 'image_file', maxCount: 1 }]);

exports.timelineAudioUploader = multer({
  storage: timelineStorage,
  limits: { fileSize: AUDIO_LIMIT, files: 1, fields: 2, parts: 4, fieldSize: ID_FIELD_SIZE_LIMIT },
  fileFilter: audioFilter,
}).fields([{ name: 'audio_file', maxCount: 1 }]);

exports.timelineVideoUploader = multer({
  storage: timelineStorage,
  limits: { fileSize: VIDEO_LIMIT, files: 2, fields: 2, parts: 5, fieldSize: ID_FIELD_SIZE_LIMIT },
  fileFilter: videoOrSubtitleFilter,
}).fields([
  { name: 'video_file', maxCount: 1 },
  { name: 'video_subtitle_file', maxCount: 1 },
]);

exports.SUBTITLE_LIMIT = SUBTITLE_LIMIT;
