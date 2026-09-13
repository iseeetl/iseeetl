const fs = require('fs');
const path = require('path');

const AppError = require('../../utils/appError');

const assertStoredFile = (file) => {
  if (!file?.path || !file?.filename) throw new AppError({ code: 'INVALID_PARAMS' });
  return file;
};

const replaceExtension = (filename, extension) => {
  const current = path.extname(filename);
  return current ? `${filename.slice(0, -current.length)}${extension}` : `${filename}${extension}`;
};

const removeFileIfExists = async (filePath) => {
  if (!filePath) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const removeStoredFiles = async (filePaths) => {
  await Promise.all((filePaths || []).filter(Boolean).map((filePath) => removeFileIfExists(filePath).catch(() => false)));
};

module.exports = {
  assertStoredFile,
  removeFileIfExists,
  removeStoredFiles,
  replaceExtension,
};
