const ACCESS_ROOM_PREFIX = '__access__:floor-user';
const USER_ACCESS_ROOM_PREFIX = '__access__:user';

const buildFloorUserAccessRoom = (floorId, userId) =>
  `${ACCESS_ROOM_PREFIX}:${String(floorId)}:${String(userId)}`;
const buildUserAccessRoom = (userId) => `${USER_ACCESS_ROOM_PREFIX}:${String(userId)}`;
const buildRoomAccessRoom = (roomId) => `__access__:room:${String(roomId)}`;
const buildFloorAccessRoom = (floorId) => `__access__:floor:${String(floorId)}`;

module.exports = {
  ACCESS_ROOM_PREFIX,
  USER_ACCESS_ROOM_PREFIX,
  buildFloorUserAccessRoom,
  buildUserAccessRoom,
  buildRoomAccessRoom,
  buildFloorAccessRoom,
};
