const { authorizeRoomAccess, ensureRoomContext } = require('../services/room/roomAccess.service');
const { buildFloorUserAccessRoom, buildUserAccessRoom, buildRoomAccessRoom, buildFloorAccessRoom } = require('./accessRooms');
const { SOCKET_ACCESS_ERRORS } = require('./authenticateSocket');
const { findUserForSession } = require('../services/_shared/userSession');

const emitRoomStatus = (io, roomId, users) => {
  const languages = new Set();
  if (users) {
    users.forEach((user) => {
      if (user.languages instanceof Map) {
        user.languages.forEach((lang) => languages.add(lang));
      } else if (user.lang) {
        languages.add(user.lang);
      }
    });
  }
  io.to(roomId).emit('ROOM_STATUS_UPDATE', {
    roomSize: users ? users.size : 0,
    languages: Array.from(languages),
  });
};

const joinSocketRooms = async (socket) => {
  const { room_id: roomId, floor_id: floorId, user_id: userId } = socket.userData;

  await socket.join(buildFloorAccessRoom(floorId));
  if (!socket.connected) return false;
  await socket.join(buildRoomAccessRoom(roomId));
  if (!socket.connected) return false;

  if (socket.userData.authenticated_user) {
    await socket.join(buildUserAccessRoom(userId));
    if (!socket.connected) return false;
    await socket.join(buildFloorUserAccessRoom(floorId, userId));
    if (!socket.connected) return false;
    const user = await findUserForSession({ user_id: userId, session_version: socket.data?.sessionVersion });
    if (!user) throw new Error('User session revoked');
    if (!socket.connected) return false;
    socket.userData.user_role = user.role;
    if (socket.data?.accessContext) socket.data.accessContext.user_role = user.role;
    await authorizeRoomAccess(userId, user.role, roomId, { errors: SOCKET_ACCESS_ERRORS });
    if (!socket.connected) return false;
  } else {
    const { room } = await ensureRoomContext(roomId, { errors: SOCKET_ACCESS_ERRORS });
    if (room.member_only) throw new Error('Room access revoked');
    if (!socket.connected) return false;
  }

  await socket.join(roomId);
  return socket.connected;
};

const registerParticipant = (roomParticipants, socket) => {
  const { room_id: roomId, user_id: userId, lang } = socket.userData;
  if (!roomParticipants.has(roomId)) roomParticipants.set(roomId, new Map());

  const users = roomParticipants.get(roomId);
  if (!users.has(userId)) users.set(userId, { sockets: new Set(), languages: new Map() });
  const userData = users.get(userId);
  if (!(userData.languages instanceof Map)) {
    userData.languages = new Map(Array.from(userData.sockets || []).map((socketId) => [socketId, userData.lang]));
  }
  userData.lang = lang;
  userData.sockets.add(socket.id);
  userData.languages.set(socket.id, lang);
  return users;
};

const removeParticipant = (roomParticipants, socket) => {
  const { room_id: roomId, user_id: userId } = socket.userData;
  const users = roomParticipants.get(roomId);
  if (!users) return null;

  const userData = users.get(userId);
  if (userData) {
    userData.sockets.delete(socket.id);
    if (userData.languages instanceof Map) userData.languages.delete(socket.id);
    if (userData.sockets.size === 0) users.delete(userId);
  }
  if (users.size === 0) roomParticipants.delete(roomId);
  return users;
};

const createRoomPresenceHandler = (io, roomParticipants) => async (socket) => {
  const roomId = socket.userData.room_id;
  try {
    if (!(await joinSocketRooms(socket))) return;
  } catch (error) {
    void error;
    socket.disconnect(true);
    return;
  }

  const users = registerParticipant(roomParticipants, socket);
  emitRoomStatus(io, roomId, users);

  socket.on('disconnect', () => {
    const remainingUsers = removeParticipant(roomParticipants, socket);
    if (remainingUsers) emitRoomStatus(io, roomId, remainingUsers);
  });
};

module.exports = {
  createRoomPresenceHandler,
  emitRoomStatus,
  joinSocketRooms,
  registerParticipant,
  removeParticipant,
};
