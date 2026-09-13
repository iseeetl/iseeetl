const SoundTag = require('../models/SoundTag');
const RoomTag = require('../models/RoomTag');
const AppError = require('../utils/appError');
const { authorizeRoomAccess } = require('./room/roomAccess.service');

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });

async function authorizeSoundTagContext({ floorId, roomId, jwtPayload }) {
  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;
  const context = await authorizeRoomAccess(userId, userRole, roomId);

  if (String(context.foundFloor._id) !== String(floorId)) {
    throw invalidParams();
  }

  return context;
}

async function validateRoomTags(tags, { foundFloor, foundRoom }) {
  if (!Array.isArray(tags)) throw invalidParams();

  const tagIds = [...new Set(tags.map(String))];
  if (tagIds.length === 0) return tagIds;

  const count = await RoomTag.countDocuments({
    _id: { $in: tagIds },
    floor: foundFloor._id,
    room: foundRoom._id,
    delete_flg: false,
  });
  if (count !== tagIds.length) throw invalidParams();

  return tagIds;
}

exports.getSoundTag = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const { foundUser, foundRoom, foundFloor } = await authorizeSoundTagContext({
    floorId,
    roomId,
    jwtPayload,
  });

  const foundSoundTag = await SoundTag.findOne({
    floor: foundFloor._id,
    room: foundRoom._id,
    user: foundUser._id,
  });

  return foundSoundTag;
};

exports.createSoundTag = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const { foundUser, foundRoom, foundFloor } = await authorizeSoundTagContext({
    floorId,
    roomId,
    jwtPayload,
  });
  const tags = await validateRoomTags(body.tags, { foundFloor, foundRoom });
  const now = Date.now();

  return SoundTag.findOneAndUpdate(
    { floor: foundFloor._id, room: foundRoom._id, user: foundUser._id },
    {
      $set: { tags, updated_at: now },
      $setOnInsert: {
        floor: foundFloor._id,
        room: foundRoom._id,
        user: foundUser._id,
        created_at: now,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

exports.updateSoundTag = async (body, jwtPayload) => {
  const id = body._id;
  const userId = jwtPayload.user_id;

  const foundSoundTag = await SoundTag.findById(id).lean();
  if (!foundSoundTag) throw new AppError({ code: 'NOT_FOUND' });

  if (String(foundSoundTag.user) !== String(userId)) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  const { foundRoom, foundFloor } = await authorizeSoundTagContext({
    floorId: foundSoundTag.floor,
    roomId: foundSoundTag.room,
    jwtPayload,
  });
  const tags = await validateRoomTags(body.tags, { foundFloor, foundRoom });

  const updatedSoundTag = await SoundTag.findOneAndUpdate(
    {
      _id: id,
      floor: foundFloor._id,
      room: foundRoom._id,
      user: userId,
    },
    { $set: { tags, updated_at: Date.now() } },
    { new: true, runValidators: true }
  );
  if (!updatedSoundTag) throw new AppError({ code: 'NOT_FOUND' });

  return updatedSoundTag;
};
