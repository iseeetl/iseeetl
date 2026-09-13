const { removeUploadedFiles } = require('../services/upload/uploadCleanup');
const { validationResult } = require('express-validator');
const AppError = require('../utils/appError');
const multer = require('multer');

const collectUploadPaths = (req) => {
  const paths = [];

  if (req?.file?.path) paths.push(req.file.path);

  if (Array.isArray(req?.files)) {
    req.files.forEach((file) => {
      if (file?.path) paths.push(file.path);
    });
  } else if (req?.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((files) => {
      if (!Array.isArray(files)) return;
      files.forEach((file) => {
        if (file?.path) paths.push(file.path);
      });
    });
  }

  return [...new Set(paths)];
};

const cleanupUploadedFiles = async (req) => removeUploadedFiles(collectUploadPaths(req));

const finalize = async (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    await cleanupUploadedFiles(req);
    return next(new AppError({ code: 'INVALID_PARAMS' }));
  }
  next();
};

const cleanupUploadOnError = async (err, req, _res, next) => {
  await cleanupUploadedFiles(req);
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_PARAMS';
    return next(new AppError({ code }));
  }
  next(err);
};

const requireFiles =
  (fields = []) =>
  (req, _res, next) => {
    const missing = fields.filter(
      (name) => !(req.files && Array.isArray(req.files[name]) && req.files[name].length > 0)
    );
    if (missing.length) return next(new AppError({ code: 'INVALID_PARAMS' }));
    next();
  };

const requireAnyFile =
  (fields = []) =>
  (req, _res, next) => {
    const found = fields.some(
      (name) => req.files && Array.isArray(req.files[name]) && req.files[name].length > 0
    );
    if (!found) return next(new AppError({ code: 'INVALID_PARAMS' }));
    next();
  };

module.exports = {
  cleanupUploadedFiles,
  cleanupUploadOnError,
  finalize,
  requireAnyFile,
  requireFiles,
};
