const AppError = require('../../utils/appError');
const User = require('../../models/User');
const Floor = require('../../models/Floor');
const Room = require('../../models/Room');

const defaultNotFound = { code: 'NOT_FOUND' };

const buildError = (custom, fallback) => ({
  code: custom?.code || fallback.code,
});

async function findActiveDoc(Model, id, { select, error } = {}) {
  const notFoundError = buildError(error, defaultNotFound);
  const query = Model.findOne({ _id: id, delete_flg: false });
  if (select) query.select(select);
  const doc = await query;
  if (!doc) throw new AppError({ code: notFoundError.code });
  return doc;
}

const findActiveUser = (userId, options) => findActiveDoc(User, userId, options);
const findActiveFloor = (floorId, options) => findActiveDoc(Floor, floorId, options);
const findActiveRoom = (roomId, options) => findActiveDoc(Room, roomId, options);

async function findRoomWithFloor(roomId, { roomSelect, floorSelect, roomError, floorError } = {}) {
  const room = await findActiveRoom(roomId, { select: roomSelect, error: roomError });
  const floor = await findActiveFloor(room.floor, { select: floorSelect, error: floorError });
  return { room, floor };
}

module.exports = { findActiveUser, findActiveFloor, findActiveRoom, findRoomWithFloor };
