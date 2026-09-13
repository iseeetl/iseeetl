const AppError = require('../../utils/appError');
const ROLES = require('../../constants/roles');

const User = require('../../models/User');
const FloorMember = require('../../models/FloorMember');
const RoomMember = require('../../models/RoomMember');
const KickedUser = require('../../models/KickedUser');
const { findActiveUser, findActiveRoom, findActiveFloor } = require('../_shared/activeResource');

const DEFAULT_ROOM_ACCESS_ERRORS = {
  user: { code: 'INVALID_PARAMS' },
  room: { code: 'INVALID_PARAMS' },
  floor: { code: 'INVALID_PARAMS' },
  kicked: { code: 'INVALID_PERMISSION' },
  permission: { code: 'INVALID_PERMISSION' },
};

function buildError(custom, fallback) {
  return {
    code: custom?.code || fallback.code,
  };
}

function buildRoomAccessErrors(customErrors = {}) {
  return {
    user: buildError(customErrors.user, DEFAULT_ROOM_ACCESS_ERRORS.user),
    room: buildError(customErrors.room, DEFAULT_ROOM_ACCESS_ERRORS.room),
    floor: buildError(customErrors.floor, DEFAULT_ROOM_ACCESS_ERRORS.floor),
    kicked: buildError(customErrors.kicked, DEFAULT_ROOM_ACCESS_ERRORS.kicked),
    permission: buildError(customErrors.permission, DEFAULT_ROOM_ACCESS_ERRORS.permission),
  };
}

async function ensureRoomContext(roomId, { errors, roomSelect, floorSelect } = {}) {
  const normalized = buildRoomAccessErrors(errors);
  const room = await findActiveRoom(roomId, {
    select: roomSelect || '_id floor member_only title',
    error: normalized.room,
  });
  const floor = await findActiveFloor(room.floor, {
    select: floorSelect || '_id user title target_langs',
    error: normalized.floor,
  });
  return { room, floor };
}

function hasRoomPermission({ userId, userRole, room, floor, isKicked, hasFloorMember, hasRoomMember }) {
  if (isKicked) return false;
  if (room.member_only !== true) return true;
  if (userRole === ROLES.ADMINISTRATOR) return true;
  if (userRole === ROLES.EDITOR && String(floor.user) === String(userId)) return true;
  return hasFloorMember || hasRoomMember;
}

// 通知候補ごとのDB照会を避けるため、ユーザ・キック・所属情報をまとめて取得する。
// 現在もルームへアクセスできる有効なユーザのIDを、重複を除いて入力順に返す。
async function filterAuthorizedRoomUserIds(userIds, roomId) {
  const normalizedUserIds = Array.from(
    new Set((userIds || []).filter((userId) => userId != null).map((userId) => String(userId)))
  );
  if (!normalizedUserIds.length) return [];

  const [{ room, floor }, users] = await Promise.all([
    ensureRoomContext(roomId),
    User.find({ _id: { $in: normalizedUserIds }, delete_flg: false }).select('_id role'),
  ]);

  const activeUsers = new Map(users.map((user) => [String(user._id), user]));
  if (!activeUsers.size) return [];

  const activeUserIds = Array.from(activeUsers.keys());
  const [kickedUsers, floorMembers, roomMembers] = await Promise.all([
    KickedUser.find({ floor: floor._id, user: { $in: activeUserIds } }).select('user'),
    FloorMember.find({ floor: floor._id, user: { $in: activeUserIds } }).select('user'),
    RoomMember.find({ room: room._id, user: { $in: activeUserIds } }).select('user'),
  ]);

  const kickedUserIds = new Set(kickedUsers.map((entry) => String(entry.user)));
  const floorMemberIds = new Set(floorMembers.map((entry) => String(entry.user)));
  const roomMemberIds = new Set(roomMembers.map((entry) => String(entry.user)));

  return normalizedUserIds.filter((userId) => {
    const user = activeUsers.get(userId);
    if (!user) return false;
    return hasRoomPermission({
      userId,
      userRole: user.role,
      room,
      floor,
      isKicked: kickedUserIds.has(userId),
      hasFloorMember: floorMemberIds.has(userId),
      hasRoomMember: roomMemberIds.has(userId),
    });
  });
}

// options.contextで取得済みのroom・floorを再利用し、options.errorsで認可エラーを指定できる。
// 取得項目はoptions.roomSelect・options.floorSelectで指定する。
// 認可に失敗するとAppErrorを投げ、成功するとユーザ・ルーム・フロアと所属データを返す。
async function authorizeRoomAccess(decodedUserId, decodedUserRole, roomId, options = {}) {
  const errors = buildRoomAccessErrors(options.errors);
  const roomSelect = options.roomSelect || '_id floor member_only title';
  const floorSelect = options.floorSelect || '_id user title target_langs';

  const userPromise = findActiveUser(decodedUserId, { select: '_id username', error: errors.user });
  const roomPromise = options.context?.room
    ? Promise.resolve(options.context.room)
    : findActiveRoom(roomId, { select: roomSelect, error: errors.room });

  const [foundUser, foundRoom] = await Promise.all([userPromise, roomPromise]);

  const foundFloor = options.context?.floor
    ? options.context.floor
    : await findActiveFloor(foundRoom.floor, { select: floorSelect, error: errors.floor });

  const kickedUser = await KickedUser.findOne({ user: decodedUserId, floor: foundFloor._id }).select('_id');
  if (kickedUser !== null) {
    throw new AppError({ code: errors.kicked.code });
  }

  const [foundFloorMember, foundRoomMember] = await Promise.all([
    FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId }).select('_id'),
    RoomMember.findOne({ room: roomId, user: decodedUserId }).select('_id'),
  ]);

  if (
    !hasRoomPermission({
      userId: decodedUserId,
      userRole: decodedUserRole,
      room: foundRoom,
      floor: foundFloor,
      isKicked: false,
      hasFloorMember: foundFloorMember !== null,
      hasRoomMember: foundRoomMember !== null,
    })
  ) {
    throw new AppError({ code: errors.permission.code });
  }

  return {
    foundUser,
    foundRoom,
    foundFloor,
    foundFloorMember,
    foundRoomMember,
  };
}

async function authorizeRoomMetadataAccess(roomId, { jwtPayload, guest, errors: customErrors = {} } = {}) {
  const errors = {
    user: { code: 'INVALID_PERMISSION' },
    room: { code: 'NOT_FOUND' },
    floor: { code: 'NOT_FOUND' },
    kicked: { code: 'INVALID_PERMISSION' },
    permission: { code: 'INVALID_PERMISSION' },
    ...customErrors,
  };
  const context = await ensureRoomContext(roomId, { errors });

  if (jwtPayload) {
    const authorized = await authorizeRoomAccess(
      jwtPayload.user_id,
      jwtPayload.user_role,
      roomId,
      { context, errors }
    );
    return {
      user: authorized.foundUser,
      room: authorized.foundRoom,
      floor: authorized.foundFloor,
    };
  }

  if (context.room.member_only === true) {
    throw new AppError({ code: guest?.id ? 'INVALID_PERMISSION' : 'TOKEN_INVALID' });
  }

  return context;
}

module.exports = {
  authorizeRoomAccess,
  authorizeRoomMetadataAccess,
  ensureRoomContext,
  filterAuthorizedRoomUserIds,
};
