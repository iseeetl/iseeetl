const Room = require('../../../models/Room');
const AppError = require('../../../utils/appError');

const ensureRoomBelongsToFloor = async (floorId, roomId) => {
  const foundRoom = await Room.findOne({ _id: roomId, floor: floorId }).select({ _id: 1 });
  if (!foundRoom) throw new AppError({ code: 'INVALID_PARAMS' });
};

module.exports = {
  ensureRoomBelongsToFloor,
};
