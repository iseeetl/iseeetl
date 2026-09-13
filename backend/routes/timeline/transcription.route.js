const express = require('express');
const router = express.Router();
const multer = require('multer');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const { validateMongoId, validateLang } = require('../../validates/base.validate');
const { finalize } = require('../../middlewares/validation');
const transcriptionController = require('../../controllers/timeline/transcription.controller');
const UploadConstant = require('../../constants/uploads');
const AppError = require('../../utils/appError');
const { isOpenAITranscriptionEnabled } = require('../../config/featureFlags');

// ブラウザごとの録音形式差を許容するため、対応可能な音声MIMEを受け入れる。
const ALLOWED_MIME = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UploadConstant.AUDIO_LIMIT },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new AppError({ code: 'INVALID_FILE_TYPE' }));
    }
    cb(null, true);
  },
});

const adaptMulterError = (err, next) => {
  if (!err) return next();
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError({ code: 'FILE_TOO_LARGE' }));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError({ code: 'INVALID_FILE' }));
    }
    return next(new AppError({ code: 'INVALID_FILE' }));
  }
  next(err);
};

const requireFile = (field) => (req, _res, next) => {
  if (!req.file || req.file.fieldname !== field) {
    return next(new AppError({ code: 'FILE_REQUIRED' }));
  }
  next();
};

const ensureTranscriptionEnabled = (_req, _res, next) => {
  if (!isOpenAITranscriptionEnabled()) {
    return next(
      new AppError({
        code: 'EXTERNAL_FEATURE_DISABLED',
        details: { feature: 'openaiTranscription' },
      })
    );
  }
  return next();
};

router.post(
  '/transcription/audio',
  ensureJsonWebToken,
  ensureTranscriptionEnabled,
  (req, res, next) => upload.single('file')(req, res, (err) => adaptMulterError(err, next)),
  requireFile('file'),
  validateMongoId('room_id'),
  validateLang('lang'),
  finalize,
  transcriptionController.transcribe
);

module.exports = router;
