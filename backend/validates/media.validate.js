const mongoose = require('mongoose');
const { body } = require('express-validator');

const isCanonicalDecimalIdentifier = (value) => /^(?:0|[1-9]\d*)$/.test(value);

const validateFileName = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => {
      if (value === null) return true;
      const imageNameWithoutExtension = value.replace(/\.[^\.]+$/, '');
      const parts = imageNameWithoutExtension.split('_');
      if (parts.length !== 2) throw new Error('Invalid image name format');
      if (!isCanonicalDecimalIdentifier(parts[0]))
        throw new Error('Invalid timestamp format in image name');
      if (!mongoose.Types.ObjectId.isValid(parts[1])) throw new Error('Invalid ObjectId format in image name');
      return true;
    });
};

const validateFileThumbnailName = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => {
      if (value === null) return true;
      const imageNameWithoutExtension = value.replace(/\.[^\.]+$/, '');
      const parts = imageNameWithoutExtension.split('_');
      if (parts.length !== 3) throw new Error('Invalid image name format');
      if (!isCanonicalDecimalIdentifier(parts[0]))
        throw new Error('Invalid timestamp format in image name');
      if (!mongoose.Types.ObjectId.isValid(parts[1])) throw new Error('Invalid ObjectId format in image name');
      if (parts[2] !== 'thumbnail') throw new Error('Invalid suffix format in image name');
      return true;
    });
};

const validateImageCaption = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 200));
};

const validateVideoSubtitleOriginalname = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 100));
};

const validateAudioTitle = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 200));
};

const validateAudioDescription = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 200));
};

const validateImageName = (fieldName) => {
  return validateFileName(fieldName);
};

module.exports = {
  validateFileName,
  validateFileThumbnailName,
  validateImageCaption,
  validateVideoSubtitleOriginalname,
  validateAudioTitle,
  validateAudioDescription,
  validateImageName,
};
