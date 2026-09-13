const { body } = require('express-validator');

const validate24BytesHexToken = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ min: 48, max: 48 }).isHexadecimal();
};

const validateResetPasswordToken = (fieldName) => {
  return validate24BytesHexToken(fieldName);
};

const validateInviteToken = (fieldName) => {
  return validate24BytesHexToken(fieldName);
};

module.exports = {
  validate24BytesHexToken,
  validateResetPasswordToken,
  validateInviteToken,
};
