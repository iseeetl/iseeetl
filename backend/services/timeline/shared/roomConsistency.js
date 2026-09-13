const AppError = require('../../../utils/appError');

function toIdString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // MongooseのObjectIdは_idで自身を返すため、_idをたどる前に文字列へ変換する。
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id && value._id !== value) return toIdString(value._id);
  }
  if (typeof value.toString === 'function') return value.toString();
  return null;
}

function ensureChatBelongsToRoom(chat, expectedRoom, code = 'INVALID_PARAMS') {
  const chatRoomId = toIdString(chat && chat.room);
  const expectedRoomId = toIdString(expectedRoom);
  if (!chatRoomId || !expectedRoomId || chatRoomId !== expectedRoomId) {
    throw new AppError({ code });
  }
}

module.exports = {
  ensureChatBelongsToRoom,
  toIdString,
};
