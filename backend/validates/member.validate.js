const { body } = require('express-validator');
const { validate24BytesHexToken } = require('./auth.validate');

const validateFloorMemberInviteToken = (fieldName) => {
  return validate24BytesHexToken(fieldName);
};

const validatePeriod = (period) => {
  return body(period).exists().isIn(['8h', '3d', '1m']);
};

const validateRoomMemberInviteToken = (fieldName) => {
  return validate24BytesHexToken(fieldName);
};

module.exports = {
  validateFloorMemberInviteToken,
  validatePeriod,
  validateRoomMemberInviteToken,
};
