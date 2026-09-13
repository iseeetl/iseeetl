const RoomTag = require('../../../models/RoomTag');
const AppError = require('../../../utils/appError');

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });

async function validateRoomTagsForRoom(roomTags, { floorId, roomId }) {
  if (!Array.isArray(roomTags) || !floorId || !roomId) throw invalidParams();

  const uniqueTagIds = [...new Set(roomTags.map(String))];
  if (uniqueTagIds.length === 0) return roomTags;

  const count = await RoomTag.countDocuments({
    _id: { $in: uniqueTagIds },
    floor: floorId,
    room: roomId,
    delete_flg: false,
  });
  if (count !== uniqueTagIds.length) throw invalidParams();

  return roomTags;
}

module.exports = { validateRoomTagsForRoom };
