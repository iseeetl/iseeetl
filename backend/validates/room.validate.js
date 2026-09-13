const { body } = require('express-validator');

const validateRoomTitle = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ max: 100 }).notEmpty();
};

const validateRoomDescription = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 200));
};

const validateRoomSearch = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 100));
};

const validateGuestReactionOnly = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateMemberOnly = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateNotification = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateRoomDisplayHidden = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateRoomExternalSnsButton = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateRoomDisplayOrders = (fieldName) => {
  return body(fieldName).exists().isArray();
};

const validateRoomDisplayOrder = (fieldName) => {
  return body(fieldName).exists().isInt({ min: 0 });
};

module.exports = {
  validateRoomTitle,
  validateRoomDescription,
  validateRoomSearch,
  validateGuestReactionOnly,
  validateMemberOnly,
  validateNotification,
  validateRoomDisplayHidden,
  validateRoomExternalSnsButton,
  validateRoomDisplayOrders,
  validateRoomDisplayOrder,
};
