const ROLES = require('../../constants/roles');
const AppError = require('../../utils/appError');

const FloorMember = require('../../models/FloorMember');
const RoomMember = require('../../models/RoomMember');
const { findActiveUser, findActiveFloor, findActiveRoom } = require('../_shared/activeResource');

exports.resolveTimelineRole = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const userRole = jwtPayload.user_role;
  const userId = jwtPayload.user_id;

  await findActiveUser(userId, { error: { code: 'INVALID_PARAMS' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  const foundRoom = await findActiveRoom(roomId, { error: { code: 'INVALID_PARAMS' } });

  if (foundRoom.floor.toString() !== foundFloor._id.toString()) throw new AppError({ code: 'INVALID_PARAMS' });

  const floorMember = await FloorMember.findOne({ floor: floorId, user: userId });

  const roomMember = await RoomMember.findOne({ room: roomId, user: userId });

  if (userRole === ROLES.ADMINISTRATOR) return { role: ROLES.ADMINISTRATOR };

  if (foundFloor.user.toString() === userId && userRole === ROLES.EDITOR) return { role: ROLES.FLOOR_EDITOR };

  if (floorMember) return { role: ROLES.FLOOR_MEMBER };

  if (roomMember) return { role: ROLES.ROOM_MEMBER };

  return { role: ROLES.AUTHOR };
};
