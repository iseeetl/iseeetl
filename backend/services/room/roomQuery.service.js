const FloorMember = require('../../models/FloorMember');
const Room = require('../../models/Room');
const RoomMember = require('../../models/RoomMember');
const Chat = require('../../models/Chat');
const { findActiveFloor, findRoomWithFloor } = require('../_shared/activeResource');
const { hasFloorAccess } = require('../_shared/floorAccess');

async function attachLastPostDates(rooms) {
  const roomIds = rooms.map((room) => room._id);
  if (!roomIds.length) return rooms;

  const rows = await Chat.aggregate([
    { $match: { room: { $in: roomIds }, delete_flg: false } },
    { $sort: { created_at: -1 } },
    { $group: { _id: '$room', last_post_date: { $first: '$created_at' } } },
  ]);
  const lastMap = new Map(rows.map((row) => [row._id.toString(), row.last_post_date]));
  for (const room of rooms) {
    room.last_post_date = lastMap.get(room._id.toString()) || null;
  }

  return rooms;
}

async function attachCurrentUserRoomMemberships(rooms, userId) {
  const roomIds = rooms.map((room) => room._id);
  if (!roomIds.length) return rooms;

  const memberships = await RoomMember.find({ room: { $in: roomIds }, user: userId }).select('room').lean();
  const memberRoomIds = new Set(memberships.map((membership) => membership.room.toString()));

  for (const room of rooms) {
    room.current_user_is_room_member = memberRoomIds.has(room._id.toString());
  }

  return rooms;
}

exports.guestList = async (body) => {
  const floorId = body.floor_id;

  await findActiveFloor(floorId);

  const filterQuery = {
    floor: floorId,
    room_display_hidden: { $ne: true },
    delete_flg: false,
  };

  const foundRooms = await Room.find(filterQuery)
    .populate('user', 'username image_name')
    .sort({ display_order: 1, created_at: -1 })
    .lean();

  // ルームごとのDB照会を避けるため、各ルームの最新投稿日時をまとめて取得する。
  await attachLastPostDates(foundRooms);

  return foundRooms;
};

exports.list = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const foundFloor = await findActiveFloor(floorId);

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId }).lean();

  const hasPermission = hasFloorAccess({
    role: decodedUserRole,
    floor: foundFloor,
    uid: decodedUserId,
    floorMember: foundFloorMember,
  });

  let filter;
  if (hasPermission) {
    filter = { floor: floorId, delete_flg: false };
  } else {
    filter = {
      floor: floorId,
      room_display_hidden: { $ne: true },
      delete_flg: false,
    };
  }

  const foundRooms = await Room.find(filter)
    .populate('user', 'username image_name')
    .sort({ display_order: 1, created_at: -1 })
    .lean();

  // ルームごとのDB照会を避けるため、各ルームの最新投稿日時をまとめて取得する。
  await attachLastPostDates(foundRooms);

  // ルームごとのDB照会を避けるため、現在のユーザの所属情報をまとめて取得する。
  await attachCurrentUserRoomMemberships(foundRooms, decodedUserId);

  return foundRooms;
};

exports.detail = async (body) => {
  const roomId = body._id;

  const { room: foundRoom } = await findRoomWithFloor(roomId);

  const populatedRoom = await foundRoom.populate([
    { path: 'floor', select: 'title target_langs translations floor_display_hidden' },
    { path: 'user', select: 'username image_name' },
  ]);

  return populatedRoom;
};
