const AppError = require('../../../utils/appError');
const Chat = require('../../../models/Chat');

const DEFAULT_CHAT_ERROR = { code: 'INVALID_PARAMS' };

async function findActiveChatOrThrow(postId, options = {}) {
  let query = Chat.findOne({
    _id: postId,
    ...(options.roomId ? { room: options.roomId } : {}),
    delete_flg: false,
  });
  if (options.populate) {
    query = query.populate(options.populate);
  }
  if (options.lean) {
    query = query.lean();
  }

  const result = query.exec ? await query.exec() : await query;
  if (!result) {
    const error = options.error || DEFAULT_CHAT_ERROR;
    throw new AppError({ code: error.code });
  }
  return result;
}

module.exports = {
  findActiveChatOrThrow,
};
