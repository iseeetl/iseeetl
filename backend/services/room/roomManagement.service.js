const { revalidateRestrictedRoom, revokeRoom } = require('../../socket/configurationRevocation');
const AppError = require('../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const { escapeRegExp } = require('../../utils/regex');

const Floor = require('../../models/Floor');
const Room = require('../../models/Room');
const { buildPaginationOptions, withOptionalDeleteFlag } = require('../_shared/paginationHelpers');
const { buildDeleteFlagUpdate } = require('../_shared/updateHelpers');
const { requireAdminUser } = require('../_shared/memberHelpers');
const { validateRoomImage, removeReplacedRoomImage } = require('./roomImage.service');
const translationService = require('../translation.service');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

exports.managementPaginate = async (body, jwtPayload) => {
  const { page, search, floor_id: floorId } = body;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  let query = {};
  if (floorId) query.floor = floorId;
  if (search) {
    const pattern = escapeRegExp(search);
    query.$or = [{ title: { $regex: pattern, $options: 'i' } }, { description: { $regex: pattern, $options: 'i' } }];
  }
  query = withOptionalDeleteFlag(query, body.delete_flg);

  const options = buildPaginationOptions({
    page,
    sort: { created_at: 'desc' },
    populate: [
      { path: 'user', select: 'username' },
      { path: 'floor', select: 'title delete_flg' },
    ],
    lean: true,
  });

  const foundRooms = await Room.paginate(query, options);
  return foundRooms;
};

exports.managementUpdate = async (body, jwtPayload, io) => {
  const roomId = body._id;
  const title = body.title;
  const description = body.description;
  const lang = body.lang;
  const imageName = body.image_name;
  const guestReactionOnly = body.guest_reaction_only;
  const memberOnly = body.member_only;
  const roomDisplayHidden = body.room_display_hidden;
  const notification = body.notification;
  const externalSnsButton = body.external_sns_button;
  const expectedDeleteFlg = body.delete_flg;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  const foundRoom = await Room.findOne({ _id: roomId });
  if (!foundRoom) throw new AppError({ code: 'NOT_FOUND' });
  if (foundRoom.delete_flg !== expectedDeleteFlg) {
    throw new AppError({ code: 'CONFLICT' });
  }

  const foundFloor = await Floor.findOne({ _id: foundRoom.floor });
  if (!foundFloor) throw new AppError({ code: 'NOT_FOUND' });

  await validateRoomImage({ room: foundRoom, imageName, userId: decodedUserId });

  const contentChanged = foundRoom.title !== title || foundRoom.description !== description || foundRoom.lang !== lang;
  const translations = contentChanged && isGoogleTranslateEnabled()
    ? await translationService.translateTitleAndDescription(
        decodedUserId,
        title,
        description,
        lang,
        foundFloor.target_langs || []
      )
    : foundRoom.translations;

  const updateRoom = {
    title,
    description,
    lang,
    translations,
    image_name: imageName,
    guest_reaction_only: guestReactionOnly,
    member_only: memberOnly,
    room_display_hidden: roomDisplayHidden,
    notification,
    external_sns_button: externalSnsButton,
    updated_at: Date.now(),
  };

  const updatedRoom = await Room.findOneAndUpdate(
    { _id: roomId, delete_flg: expectedDeleteFlg },
    updateRoom,
    { new: true, runValidators: true }
  ).populate('user', 'username image_name');
  if (!updatedRoom) {
    const currentRoom = await Room.findById(roomId);
    throw new AppError({ code: currentRoom ? 'CONFLICT' : 'NOT_FOUND' });
  }

  if (memberOnly === true && foundRoom.member_only !== true) await revalidateRestrictedRoom(io, roomId);

  await removeReplacedRoomImage(foundRoom, imageName);

  return updatedRoom;
};

exports.managementSetDeleteState = async (body, jwtPayload, io) => {
  const roomId = body._id;
  const deleteFlg = body.delete_flg;

  await requireAdminUser(jwtPayload.user_id);
  let changed = false;
  const result = await withAIAnalysisIntegrityLock(async () => {
    const foundRoom = await Room.findById(roomId);
    if (!foundRoom) throw new AppError({ code: 'NOT_FOUND' });
    if (foundRoom.delete_flg === deleteFlg) {
      return foundRoom.populate([
        { path: 'user', select: 'username image_name' },
        { path: 'floor', select: 'title delete_flg' },
      ]);
    }

    if (!deleteFlg) {
      const activeFloor = await Floor.findOne({ _id: foundRoom.floor, delete_flg: false });
      if (!activeFloor) throw new AppError({ code: 'CONFLICT' });
    }

    const updatedRoom = await Room.findOneAndUpdate(
      { _id: roomId, delete_flg: !deleteFlg },
      {
        ...buildDeleteFlagUpdate({ deleteFlg, alwaysSetDeletedAt: true }),
        updated_at: Date.now(),
      },
      { new: true, runValidators: true }
    )
      .populate('user', 'username image_name')
      .populate('floor', 'title delete_flg');
    if (!updatedRoom) {
      const currentRoom = await Room.findById(roomId);
      throw new AppError({ code: currentRoom ? 'CONFLICT' : 'NOT_FOUND' });
    }
    changed = true;
    return updatedRoom;
  });
  if (changed && deleteFlg) await revokeRoom(io, roomId);
  return result;
};
