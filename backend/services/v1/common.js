const AppError = require('../../utils/appError');
const { isMongoId } = require('../../utils/safePath');

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });
const invalidPermission = () => new AppError({ code: 'INVALID_PERMISSION' });
const internalError = (code = 'INTERNAL_SERVER_ERROR') => new AppError({ code });

function assertDeveloper(jwtPayload) {
  if (!jwtPayload || jwtPayload.user_role !== 'developer') throw invalidPermission();
}

function isValidField(key, value) {
  switch (key) {
    case 'floor_id':
    case 'room_id':
    case 'post_id':
    case 'reply_id':
    case 'supplement_id':
      return isMongoId(value);
    default:
      return false;
  }
}

function assertFields(body, fields) {
  for (const field of fields) {
    if (!isValidField(field, body && body[field])) throw invalidParams();
  }
}

module.exports = {
  assertDeveloper,
  assertFields,
  internalError,
  invalidParams,
  invalidPermission,
  isValidField,
};
