const { body } = require('express-validator');

const validateCategoryTagSearch = (fieldName) => {
  return body(fieldName)
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 50 });
};

const validateTagOrder = (fieldName) => {
  return body(fieldName).exists().toInt().isInt({ min: 1, max: 100 });
};

const validateCategoryTagOrder = (fieldName) => {
  return validateTagOrder(fieldName);
};

const validateTagName = (fieldName) => {
  return body(fieldName)
    .exists({ checkFalsy: true })
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 });
};

const validateCategoryTagName = (fieldName) => {
  return validateTagName(fieldName);
};

const validateCsv = (fieldName) => {
  return body(fieldName)
    .exists()
    .isArray({ min: 1, max: 100 })
    .bail()
    .custom((rows) => rows.every((r) => Array.isArray(r)))
    .withMessage('csv must be an array of arrays')
    .custom((rows) => rows.every((r) => r.length === 2))
    .withMessage('each csv row must have exactly 2 columns');
};

const validateCategoryTagCsv = (fieldName) => {
  return validateCsv(fieldName);
};

const validateFloorTagOrder = (fieldName) => {
  return validateTagOrder(fieldName);
};

const validateFloorTagName = (fieldName) => {
  return validateTagName(fieldName);
};

const validateFloorTagCsv = (fieldName) => {
  return validateCsv(fieldName);
};

const validateFloorTagSearch = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 50));
};

const validateRoomTagOrder = (fieldName) => {
  return validateTagOrder(fieldName);
};

const validateRoomTagName = (fieldName) => {
  return validateTagName(fieldName);
};

const validateRoomTagCsv = (fieldName) => {
  return validateCsv(fieldName);
};

const validateSoundTags = (fieldName) => {
  return body(fieldName).exists().isArray();
};

module.exports = {
  validateCategoryTagSearch,
  validateTagOrder,
  validateCategoryTagOrder,
  validateTagName,
  validateCategoryTagName,
  validateCsv,
  validateCategoryTagCsv,
  validateFloorTagOrder,
  validateFloorTagName,
  validateFloorTagCsv,
  validateFloorTagSearch,
  validateRoomTagOrder,
  validateRoomTagName,
  validateRoomTagCsv,
  validateSoundTags,
};
