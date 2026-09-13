const mongoose = require('mongoose');

const { ALLOWED_LANGUAGES } = require('../constants/languages');
const { authorizeRoomAccess, ensureRoomContext } = require('../services/room/roomAccess.service');
const {
  authenticateGuestToken,
  authenticateUserToken,
} = require('../services/auth/tokenAuthentication.service');

const ObjectId = mongoose.Types.ObjectId;

const SOCKET_ACCESS_ERRORS = {
  room: { message: 'ルームが存在しません', status: 404 },
  floor: { message: 'フロアが存在しません', status: 404 },
  user: { message: 'ユーザーの認証情報を確認できませんでした', status: 401 },
  kicked: { message: 'このルームに参加する権限がありません', status: 403 },
  permission: { message: 'このルームに参加する権限がありません', status: 403 },
};

const resolveAuthenticatedUser = async (userToken, roomId, roomContext) => {
  let authenticated;
  try {
    authenticated = await authenticateUserToken(userToken);
  } catch (_error) {
    throw new Error('ユーザーの認証情報を確認できませんでした');
  }

  const userId = String(authenticated.user._id);
  const userRole = authenticated.user.role;
  await authorizeRoomAccess(userId, userRole, roomId, {
    context: roomContext,
    errors: SOCKET_ACCESS_ERRORS,
  });
  return { userId, userRole, sessionVersion: authenticated.user.session_version };
};

const resolveGuestId = (guestToken) => {
  try {
    return authenticateGuestToken(guestToken).guestId;
  } catch (_error) {
    throw new Error('ゲスト認証が無効か、有効期限が切れています');
  }
};

const authenticateSocket = async (socket, next) => {
  try {
    const { room_id: roomId, lang, guest_token: guestToken, user_token: userToken } = socket.handshake.query;

    if (!roomId) return next(new Error('ルーム情報が必要です'));
    if (!ObjectId.isValid(roomId)) return next(new Error('ルーム情報が正しくありません'));
    if (!lang) return next(new Error('言語の指定が必要です'));
    if (!ALLOWED_LANGUAGES.includes(lang)) return next(new Error('言語の指定が正しくありません'));
    if ((guestToken && userToken) || (!guestToken && !userToken)) {
      return next(new Error('ログイン情報またはゲスト認証情報が必要です'));
    }

    const { room, floor } = await ensureRoomContext(roomId, { errors: SOCKET_ACCESS_ERRORS });
    const canonicalRoomId = String(room._id);
    let userId;
    let userRole = null;
    let sessionVersion;
    const authenticatedUser = Boolean(userToken);

    if (authenticatedUser) {
      const authenticated = await resolveAuthenticatedUser(userToken, canonicalRoomId, { room, floor });
      userId = authenticated.userId;
      userRole = authenticated.userRole;
      sessionVersion = authenticated.sessionVersion;
    } else {
      userId = resolveGuestId(guestToken);
      if (room.member_only) return next(new Error('ゲストはこのルームに参加できません'));
    }

    socket.userData = {
      room_id: canonicalRoomId,
      floor_id: String(floor._id),
      user_id: userId,
      user_role: userRole,
      authenticated_user: authenticatedUser,
      lang,
    };
    socket.data = socket.data || {};
    socket.data.accessContext = { ...socket.userData };
    if (authenticatedUser) socket.data.sessionVersion = sessionVersion;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  SOCKET_ACCESS_ERRORS,
  authenticateSocket,
};
