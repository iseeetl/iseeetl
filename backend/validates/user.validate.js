const { body } = require('express-validator');
const ROLES = require('../constants/roles');

const normalizeMail = (value) => value.trim().toLowerCase();

const validatePassword = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ min: 8, max: 16 });
};

const validateOldPassword = (fieldName) => {
  return validatePassword(fieldName);
};

const validateNewPassword = (fieldName) => {
  return validatePassword(fieldName);
};

const validateEyeFriendlyMode = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validatePushEnabled = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateReplyPushEnabled = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateRepliedPostPushEnabled = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateUserSearch = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 20));
};

const validateMail = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .isString()
    .bail()
    .customSanitizer(normalizeMail)
    .isLength({ max: 100 })
    .bail()
    .isEmail();
};

const validateNullableMail = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .if((value) => value !== null)
    .isString()
    .bail()
    .customSanitizer(normalizeMail)
    .isLength({ max: 100 })
    .bail()
    .isEmail();
};

const validateUserRole = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .isString()
    .bail()
    .notEmpty()
    .bail()
    .isIn(Object.values(ROLES));
};

const validateDeleteFlg = (fieldName) => {
  return body(fieldName).exists().bail().isBoolean({ strict: true });
};

const validateOptionalDeleteFlg = (fieldName) => {
  return body(fieldName).optional().isBoolean({ strict: true });
};

const validateOptionalQueryDeleteFlg = (fieldName) => {
  // 管理用GETではassignQueryToBodyで移したクエリを検証し、既存の処理へbodyとして渡す。
  return body(fieldName)
    .optional()
    .isString()
    .bail()
    .isIn(['true', 'false'])
    .customSanitizer((value) => value === 'true');
};

const validatePasswordNone = (fieldName) => {
  return body(fieldName).optional().isString().isLength({ min: 8, max: 16 });
};

module.exports = {
  validatePassword,
  validateOldPassword,
  validateNewPassword,
  validateEyeFriendlyMode,
  validatePushEnabled,
  validateReplyPushEnabled,
  validateRepliedPostPushEnabled,
  validateUserSearch,
  normalizeMail,
  validateMail,
  validateNullableMail,
  validateUserRole,
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
  validatePasswordNone,
};
