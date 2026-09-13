const { notifyAndDisconnect } = require('./notifyAndDisconnect');
const { publishSocketEvent } = require('./publication');
const logger = require('../utils/logger');
const { buildFloorUserAccessRoom, buildUserAccessRoom } = require('./accessRooms');
const { filterAuthorizedRoomUserIds } = require('../services/room/roomAccess.service');

const ROOM_ACCESS_REVOKED_EVENT = 'RECEIVE_COMPLETE_DELETE_ROOM_MEMBER';
const USER_SESSION_REVOKED_EVENT = 'SESSION_REVOKED';
const USER_ROLE_UPDATED_EVENT = 'USER_ROLE_UPDATED';

function getSocketAccessContext(socket) {
  return (socket && socket.data && socket.data.accessContext) || (socket && socket.userData) || {};
}

const disconnectSocket = (socket) => notifyAndDisconnect({
  event: ROOM_ACCESS_REVOKED_EVENT,
  notify: () => socket.emit(ROOM_ACCESS_REVOKED_EVENT),
  disconnect: () => socket.disconnect(true),
  propagateDisconnectError: true,
});

const disconnectAccessRoom = (accessScope) => notifyAndDisconnect({
  event: ROOM_ACCESS_REVOKED_EVENT,
  notify: () => accessScope.emit(ROOM_ACCESS_REVOKED_EVENT),
  disconnect: () => accessScope.disconnectSockets(true),
  propagateDisconnectError: true,
});

function resolveAccessScope(io, room) {
  try {
    return io.in(room);
  } catch (error) {
    logger.error('[SOCKET] revocation scope failed');
    throw error;
  }
}

async function disconnectUserSessionSockets(io, userId) {
  if (!io || userId == null) return;
  const accessScope = resolveAccessScope(io, buildUserAccessRoom(userId));
  await notifyAndDisconnect({
    event: USER_SESSION_REVOKED_EVENT,
    notify: () => accessScope.emit(USER_SESSION_REVOKED_EVENT),
    disconnect: () => accessScope.disconnectSockets(true),
    propagateDisconnectError: true,
  });
}

async function revalidateAccessScope(accessScope, normalizedUserId) {
  let sockets;
  try {
    sockets = await accessScope.fetchSockets();
  } catch (_error) {
    logger.error('[SOCKET] revocation socket lookup failed');
    await disconnectAccessRoom(accessScope);
    return;
  }

  const socketsByRoom = new Map();
  for (const socket of sockets) {
    const context = getSocketAccessContext(socket);
    const roomId = context.room_id ? String(context.room_id) : null;
    if (!socketsByRoom.has(roomId)) socketsByRoom.set(roomId, []);
    socketsByRoom.get(roomId).push(socket);
  }

  const results = await Promise.allSettled(
    Array.from(socketsByRoom.entries()).map(async ([roomId, roomSockets]) => {
      if (roomId) {
        try {
          const authorizedUserIds = await filterAuthorizedRoomUserIds([normalizedUserId], roomId);
          if (authorizedUserIds.includes(normalizedUserId)) return;
        } catch (_error) {
          logger.error('[SOCKET] room reauthorization failed');
        }
      }
      // 他ルームの認可待ちや一接続の切断失敗で、残る拒否対象の切断を止めない。
      const disconnected = await Promise.allSettled(roomSockets.map(disconnectSocket));
      const failed = disconnected.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    })
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
}

async function revalidateFloorUserSockets(io, { floorId, userId } = {}) {
  if (!io || floorId == null || userId == null) return;

  const normalizedUserId = String(userId);
  const accessRoom = buildFloorUserAccessRoom(floorId, normalizedUserId);
  await revalidateAccessScope(resolveAccessScope(io, accessRoom), normalizedUserId);
}

async function revalidateUserSockets(io, { userId, userRole } = {}) {
  if (!io || userId == null) return;

  const normalizedUserId = String(userId);
  const accessScope = resolveAccessScope(io, buildUserAccessRoom(normalizedUserId));

  if (userRole != null) {
    await publishSocketEvent(USER_ROLE_UPDATED_EVENT, () =>
      accessScope.emit(USER_ROLE_UPDATED_EVENT, { role: String(userRole) }));
  }

  await revalidateAccessScope(accessScope, normalizedUserId);
}

module.exports = {
  ROOM_ACCESS_REVOKED_EVENT,
  USER_SESSION_REVOKED_EVENT,
  USER_ROLE_UPDATED_EVENT,
  disconnectUserSessionSockets,
  revalidateFloorUserSockets,
  revalidateUserSockets,
};
