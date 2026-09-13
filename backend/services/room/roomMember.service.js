const AppError = require('../../utils/appError');

const FloorMember = require('../../models/FloorMember');
const RoomInvite = require('../../models/RoomInvite');
const RoomMember = require('../../models/RoomMember');
const { findRoomWithFloor } = require('../_shared/activeResource');
const { hasFloorAccess, isAdminOrCreator } = require('../_shared/floorAccess');
const { buildInviteTokenExpiry, createInviteToken } = require('../_shared/inviteToken');
const {
  findUserOrThrow,
  requireAdminUser,
  buildMemberManagementOptions,
} = require('../_shared/memberHelpers');
const { revalidateFloorUserSockets } = require('../../socket/accessControl');

function ensureRoomAndFloor(roomId) {
  return findRoomWithFloor(roomId, {
    roomError: { code: 'NOT_FOUND' },
    floorError: { code: 'NOT_FOUND' },
  });
}

function canViewRoomMembers(role, floor, uid, floorMember, roomMember) {
  if (hasFloorAccess({ role, floor, uid, floorMember })) return true;
  return roomMember != null;
}

function canInviteToRoom(role, floor, uid, floorMember) {
  return hasFloorAccess({ role, floor, uid, floorMember });
}

function canRemoveRoomMember(role, floor, room, uid) {
  if (isAdminOrCreator(role, floor && floor.user, uid)) return true;
  if (room && room.user && room.user.toString() === uid) return true;
  return false;
}

exports.list = async (body, jwtPayload) => {
  const roomId = body.room_id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');

  const { floor: foundFloor } = await ensureRoomAndFloor(roomId);

  const foundFloorMember = await FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId });
  const foundRoomMember = await RoomMember.findOne({ room: roomId, user: decodedUserId });

  if (!canViewRoomMembers(decodedUserRole, foundFloor, decodedUserId, foundFloorMember, foundRoomMember)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const foundRoomMembers = await RoomMember.find({ room: roomId })
    .populate('user', 'username image_name')
    .sort({ created_at: 'desc' })
    .lean();

  return foundRoomMembers;
};

exports.invite = async (body, jwtPayload) => {
  const roomId = body.room_id;
  const period = body.period;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');

  const { room: foundRoom, floor: foundFloor } = await ensureRoomAndFloor(roomId);

  const foundFloorMember = await FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId });

  if (!canInviteToRoom(decodedUserRole, foundFloor, decodedUserId, foundFloorMember)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const token = createInviteToken();
  const tokenExpiry = buildInviteTokenExpiry(period);

  const newRoomInvite = {
    floor: foundRoom.floor.toString(),
    room: roomId,
    user: decodedUserId,
    token,
    token_expiry: tokenExpiry,
  };

  const createdRoomInvite = await RoomInvite.create(newRoomInvite);
  return createdRoomInvite;
};

exports.create = async (body, jwtPayload) => {
  const roomId = body.room_id;
  const inviteToken = body.invite_token;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');

  const { floor: foundFloor } = await ensureRoomAndFloor(roomId);

  if (foundFloor.user && foundFloor.user.toString() === decodedUserId)
    throw new AppError({ code: 'FLOOR_EDITOR_NOT_REQUIRD' });

  const foundFloorMember = await FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId });
  if (foundFloorMember != null) throw new AppError({ code: 'FLOOR_MEMBER_NOT_REQUIRD' });

  const foundRoomInvite = await RoomInvite.findOne({ token: inviteToken, room: roomId, floor: foundFloor._id });
  if (!foundRoomInvite) throw new AppError({ code: 'NOT_FOUND' });

  const now = new Date();
  if (now > foundRoomInvite.token_expiry) throw new AppError({ code: 'INVITE_EXPIRED' });

  const foundRoomMember = await RoomMember.findOne({ room: roomId, user: decodedUserId });
  if (foundRoomMember != null) throw new AppError({ code: 'ALREADY_ROOM_MEMBER' });

  let createdRoomMember;
  try { createdRoomMember = await RoomMember.create({ floor: foundFloor._id, room: roomId, user: decodedUserId }); } catch (error) {
    if (error.code === 11000 && error.keyPattern?.room === 1 && error.keyPattern?.user === 1 && Object.keys(error.keyPattern).length === 2) {
      throw new AppError({ code: 'ALREADY_ROOM_MEMBER' });
    }
    throw error;
  }
  const populatedRoomMember = await RoomMember.findById(createdRoomMember._id).populate('room', 'title');

  return populatedRoomMember;
};

exports.delete = async (body, jwtPayload, io) => {
  const id = body._id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');

  const foundRoomMember = await RoomMember.findOne({ _id: id });
  if (!foundRoomMember) throw new AppError({ code: 'NOT_FOUND' });

  const { room: foundRoom, floor: foundFloor } = await ensureRoomAndFloor(foundRoomMember.room.toString());

  // サイト管理者、フロアを作成したフロア編集者、ルーム作成者のいずれかに許可する。
  if (!canRemoveRoomMember(decodedUserRole, foundFloor, foundRoom, decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const removedRoomMember = await RoomMember.findOneAndDelete({
    _id: id,
    room: foundRoomMember.room.toString(),
  });
  if (!removedRoomMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId: removedRoomMember.floor || foundFloor._id,
    userId: removedRoomMember.user,
  });
  return removedRoomMember;
};

exports.leave = async (body, jwtPayload, io) => {
  const roomId = body.room_id;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');
  const { floor: foundFloor } = await ensureRoomAndFloor(roomId);

  const removedRoomMember = await RoomMember.findOneAndDelete({ room: roomId, user: decodedUserId });
  if (!removedRoomMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId: removedRoomMember.floor || foundFloor._id,
    userId: decodedUserId,
  });

  return removedRoomMember;
};

exports.isCurrentUserRoomMember = async (body, jwtPayload) => {
  const roomId = body.room_id;
  const decodedUserId = jwtPayload.user_id;

  await findUserOrThrow(decodedUserId, 'NOT_FOUND');
  await ensureRoomAndFloor(roomId);

  const foundRoomMember = await RoomMember.findOne({ room: roomId, user: decodedUserId });
  return foundRoomMember !== null;
};

exports.managementPaginate = async (body, jwtPayload) => {
  const page = body.page;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const options = buildMemberManagementOptions({
    page,
    populate: [
      { path: 'user', select: 'username' },
      { path: 'room', select: 'title' },
    ],
  });

  return RoomMember.paginate({}, options);
};

exports.managementDelete = async (body, jwtPayload, io) => {
  const memberId = body._id;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const removedRoomMember = await RoomMember.findOneAndDelete({ _id: memberId });
  if (!removedRoomMember) throw new AppError({ code: 'NOT_FOUND' });

  await revalidateFloorUserSockets(io, {
    floorId: removedRoomMember.floor,
    userId: removedRoomMember.user,
  });
  return removedRoomMember;
};
