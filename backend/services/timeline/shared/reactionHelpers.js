const ROLES = require('../../../constants/roles');
const AppError = require('../../../utils/appError');
const { authorizeRoomAccess } = require('../../room/roomAccess.service');
const serializeTimeline = require('./timelineSerializer');
const { TIMELINE_POPULATE_WITH_REACTIONS } = require('./chatPopulate');

const Chat = require('../../../models/Chat');
const { findActiveRoom, findActiveFloor } = require('../../_shared/activeResource');

async function findChatOrThrow(postId, options = {}) {
  const query = { _id: postId, delete_flg: false };
  if (options.select) {
    const chat = await Chat.findOne(query).select(options.select);
    if (!chat) throw new AppError({ code: 'INVALID_PARAMS' });
    return chat;
  }

  const chat = await Chat.findOne(query);
  if (!chat) throw new AppError({ code: 'INVALID_PARAMS' });
  return chat;
}

async function authorizeUserFromChat(chat, jwtPayload) {
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  const access = await authorizeRoomAccess(decodedUserId, decodedUserRole, chat.room.toString());
  return { ...access, decodedUserId, decodedUserRole };
}

async function authorizeGuestFromChat(chat) {
  const foundRoom = await findActiveRoom(chat.room.toString(), {
    error: { code: 'INVALID_PARAMS' },
  });
  const foundFloor = await findActiveFloor(foundRoom.floor.toString(), {
    error: { code: 'INVALID_PARAMS' },
  });

  if (foundRoom.member_only) throw new AppError({ code: 'INVALID_PERMISSION' });

  return { foundRoom, foundFloor };
}

function canDeleteByRole({ role, floor, floorMember, userId }) {
  if (role === ROLES.ADMINISTRATOR) return true;
  if (role === ROLES.EDITOR && floor.user.toString() === userId) return true;
  return floorMember !== null;
}

function ensureGuestReactionOwner(reaction, guestId) {
  if (!reaction || reaction.guest_id === null || reaction.guest_id !== guestId) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }
}

async function populateAndClean(updatedChat) {
  const populated = await updatedChat.populate(TIMELINE_POPULATE_WITH_REACTIONS);
  return serializeTimeline(populated);
}

async function updateChatAndPopulate({ query, update, options = {} }) {
  const updatedChat = await Chat.findOneAndUpdate(query, update, {
    new: true,
    runValidators: true,
    ...options,
  });
  if (!updatedChat) throw new AppError({ code: 'NOT_FOUND' });
  return populateAndClean(updatedChat);
}

module.exports = {
  authorizeGuestFromChat,
  authorizeUserFromChat,
  canDeleteByRole,
  ensureGuestReactionOwner,
  findChatOrThrow,
  populateAndClean,
  updateChatAndPopulate,
};
