const ROLES = require('../../../constants/roles');
const AppError = require('../../../utils/appError');
const Chat = require('../../../models/Chat');
const { TIMELINE_POPULATE_WITH_REPLIES } = require('./chatPopulate');
const { ensureChatBelongsToRoom, toIdString } = require('./roomConsistency');

const buildReplyNotFoundError = () => new AppError({ code: 'INVALID_PARAMS' });

function ensureReplyContext(chat, expectedRoom, expectedPostId = null) {
  ensureChatBelongsToRoom(chat, expectedRoom, 'INVALID_PARAMS');
  if (expectedPostId !== null && toIdString(chat?._id) !== toIdString(expectedPostId)) {
    throw buildReplyNotFoundError();
  }
}

async function findChatByPostId(postId, { roomId, code = 'INVALID_PARAMS' } = {}) {
  const chat = await Chat.findOne({ _id: postId, ...(roomId ? { room: roomId } : {}), delete_flg: false });
  if (!chat) throw new AppError({ code });
  return chat;
}

async function findChatByReplyId(replyId, options = {}) {
  let query = Chat.findOne({ 'replies._id': replyId, delete_flg: false });
  if (options.populate) {
    query = query.populate(options.populate);
  }
  if (options.lean) {
    query = query.lean();
  }
  const chat = query.exec ? await query.exec() : await query;
  if (!chat) throw buildReplyNotFoundError();
  return chat;
}

function findReplyOrThrow(chat, replyId, code = 'INVALID_PARAMS') {
  const idx = chat.replies.findIndex((r) => r._id.toString() === replyId);
  if (idx === -1 || chat.replies[idx].delete_flg) throw new AppError({ code });
  return { reply: chat.replies[idx], index: idx };
}

function canEditReply({ role, floor, floorMember, reply, userId }) {
  if (role === ROLES.ADMINISTRATOR) return true;
  if (floor.user.toString() === userId && role === ROLES.EDITOR) return true;
  if (floorMember !== null) return true;
  return reply.user && reply.user.toString() === userId;
}

async function populateReplies(target) {
  if (!target) return target;
  if (typeof target.populate === 'function') {
    return target.populate(TIMELINE_POPULATE_WITH_REPLIES);
  }
  if (typeof target.then === 'function') {
    const resolved = await target;
    if (!resolved || typeof resolved.populate !== 'function') return resolved;
    return resolved.populate(TIMELINE_POPULATE_WITH_REPLIES);
  }
  return target;
}

module.exports = {
  buildReplyNotFoundError,
  ensureReplyContext,
  findChatByPostId,
  findChatByReplyId,
  findReplyOrThrow,
  canEditReply,
  populateReplies,
};
