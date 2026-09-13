const { body } = require('express-validator');

const validateFloorSearch = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 100));
};

const validateFloorTitle = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ max: 100 }).notEmpty();
};

const validateFloorDescription = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 200));
};

const validateFloorDisplayHidden = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

module.exports = {
  validateFloorSearch,
  validateFloorTitle,
  validateFloorDescription,
  validateFloorDisplayHidden,
};
