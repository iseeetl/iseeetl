const { body } = require('express-validator');

const validateSpamSearch = (fieldName) => {
  return body(fieldName)
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 50 });
};

const validateSpamWord = (fieldName) => {
  return body(fieldName)
    .exists({ checkFalsy: true })
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 });
};

module.exports = {
  validateSpamSearch,
  validateSpamWord,
};
