const ROLES = require('../constants/roles');
const AppError = require('../utils/appError');

const KickedUser = require('../models/KickedUser');
const { findActiveUser, findActiveFloor, findRoomWithFloor } = require('./_shared/activeResource');
const { isAdminOrCreator } = require('./_shared/floorAccess');
const { buildFloorUserAccessRoom } = require('../socket/accessRooms');
const { notifyAndDisconnect } = require('../socket/notifyAndDisconnect');

exports.getKickedUserList = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PARAMS' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  if (!isAdminOrCreator(decodedUserRole, foundFloor.user, decodedUserId)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  const foundKickedUsers = await KickedUser.find({ floor: floorId })
    .populate('user', 'username image_name')
    .populate('kicked_by', 'username')
    .populate('room', 'title')
    .sort({ kicked_at: 'desc' });

  return foundKickedUsers;
};

exports.checkKickedUser = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const decodedUserId = jwtPayload.user_id;

  if (!floorId && !roomId) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PARAMS' } });

  let foundFloor = null;
  if (roomId) {
    const { floor } = await findRoomWithFloor(roomId, {
      roomError: { code: 'INVALID_PARAMS' },
      floorError: { code: 'INVALID_PARAMS' },
    });
    foundFloor = floor;
  } else {
    foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });
  }

  const kickedUser = await KickedUser.findOne({ user: decodedUserId, floor: foundFloor._id });
  return kickedUser !== null;
};

exports.createKickedUser = async (body, jwtPayload, io) => {
  const userId = body.user_id;
  const roomId = body.room_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PARAMS' } });

  const targetUser = await findActiveUser(userId, { error: { code: 'INVALID_PARAMS' } });

  const { floor: foundFloor } = await findRoomWithFloor(roomId, {
    roomError: { code: 'INVALID_PARAMS' },
    floorError: { code: 'INVALID_PARAMS' },
  });

  const alreadyKickedUser = await KickedUser.findOne({ user: userId, floor: foundFloor._id });
  if (alreadyKickedUser) throw new AppError({ code: 'ALREADY_KICKED' });

  if (!isAdminOrCreator(decodedUserRole, foundFloor.user, decodedUserId)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  if (targetUser.role === ROLES.ADMINISTRATOR) {
    throw new AppError({ code: 'CANT_KICK' });
  }
  if (targetUser.role === ROLES.EDITOR && foundFloor.user.toString() === targetUser._id.toString()) {
    throw new AppError({ code: 'CANT_KICK' });
  }

  const newKickedUser = {
    user: userId,
    kicked_by: decodedUserId,
    floor: foundFloor._id.toString(),
    room: roomId,
  };

  let createdKickedUser;
  try {
    createdKickedUser = await KickedUser.create(newKickedUser);
  } catch (error) {
    if (error.code === 11000) throw new AppError({ code: 'ALREADY_KICKED' });
    throw error;
  }

  // 対象フロアに接続中の対象ユーザの全Socketへ通知し、サーバから切断する。
  // roomParticipantsの後始末は各Socketのdisconnectハンドラに委ねる。
  if (io) {
    await notifyAndDisconnect({
      event: 'KICKED_USER',
      notify: () => io.to(buildFloorUserAccessRoom(foundFloor._id, userId)).emit('KICKED_USER'),
      disconnect: () => io.in(buildFloorUserAccessRoom(foundFloor._id, userId)).disconnectSockets(true),
    });
  }

  return createdKickedUser;
};

exports.deleteKickedUser = async (body, jwtPayload) => {
  const userId = body.user_id;
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  const foundKickedUser = await KickedUser.findOne({ user: userId, floor: floorId });
  if (!foundKickedUser) throw new AppError({ code: 'INVALID_PARAMS' });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  if (!isAdminOrCreator(decodedUserRole, foundFloor.user, decodedUserId)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  // 旧版の重複も同じフロア・利用者の範囲ですべて解除する。
  const result = await KickedUser.deleteMany({ user: userId, floor: floorId });
  if (!result.deletedCount) throw new AppError({ code: 'INVALID_PARAMS' });

  return foundKickedUser;
};
