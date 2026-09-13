const { filterAuthorizedRoomUserIds } = require('../services/room/roomAccess.service');
const { buildRoomAccessRoom, buildFloorAccessRoom, buildUserAccessRoom } = require('./accessRooms');
const logger = require('../utils/logger');
const { notifyAndDisconnect } = require('./notifyAndDisconnect');

const ACCESS_REVOKED_EVENT = 'ACCESS_REVOKED';

// 保存済み変更を失敗へ変えず、通知失敗時にも切断を試みる。
const revokeTarget = (target, event, payload, isScope = false) => notifyAndDisconnect({
  event,
  notify: () => payload === undefined ? target.emit(event) : target.emit(event, payload),
  disconnect: () => isScope ? target.disconnectSockets(true) : target.disconnect(true),
});

async function revokeScope(io, scopeName, event, payload) {
  if (!io) return;
  try {
    await revokeTarget(io.in(scopeName), event, payload, true);
  } catch (_error) {
    logger.error('[SOCKET] revocation scope failed');
  }
}

async function revalidateRestrictedRoom(io, roomId) {
  if (!io || roomId == null) return;
  const payload = { scope: 'room', reason: 'room_restricted' };
  let scope;
  try {
    scope = io.in(buildRoomAccessRoom(roomId));
    const sockets = await scope.fetchSockets();
    const context = (socket) => socket.data?.accessContext || socket.userData || {};
    const userIds = sockets.filter((socket) => context(socket).authenticated_user)
      .map((socket) => context(socket).user_id);
    const allowed = new Set(await filterAuthorizedRoomUserIds(userIds, String(roomId)));
    await Promise.all(sockets.filter((socket) => {
      const identity = context(socket);
      return !identity.authenticated_user || !allowed.has(String(identity.user_id));
    }).map((socket) => revokeTarget(socket, ACCESS_REVOKED_EVENT, payload)));
  } catch (_error) {
    logger.error('[SOCKET] room reauthorization failed');
    if (scope) await revokeTarget(scope, ACCESS_REVOKED_EVENT, payload, true);
  }
}

const revokeRoom = (io, roomId) => revokeScope(io, buildRoomAccessRoom(roomId), ACCESS_REVOKED_EVENT,
  { scope: 'room', reason: 'room_deleted' });
const revokeFloor = (io, floorId) => revokeScope(io, buildFloorAccessRoom(floorId), ACCESS_REVOKED_EVENT,
  { scope: 'floor', reason: 'floor_deleted' });
const revokeUserSessions = (io, userId) => revokeScope(io, buildUserAccessRoom(userId), 'SESSION_REVOKED');

module.exports = { ACCESS_REVOKED_EVENT, revalidateRestrictedRoom, revokeRoom, revokeFloor, revokeUserSessions };
