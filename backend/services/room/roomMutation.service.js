const { revalidateRestrictedRoom, revokeRoom } = require('../../socket/configurationRevocation');
const AppError = require('../../utils/appError');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');

const FloorMember = require('../../models/FloorMember');
const Room = require('../../models/Room');

const translationService = require('../translation.service');
const { validateRoomImage, removeReplacedRoomImage } = require('./roomImage.service');
const { findActiveUser, findActiveFloor, findRoomWithFloor } = require('../_shared/activeResource');
const { hasFloorAccess } = require('../_shared/floorAccess');
const { provisionRoomResources, rollbackRoomProvisioning } = require('./roomProvisioning.service');
const {
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

exports.create = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const title = body.title;
  const description = body.description;
  const lang = body.lang;
  const guestReactionOnly = body.guest_reaction_only;
  const memberOnly = body.member_only;
  const roomDisplayHidden = body.room_display_hidden;
  const notification = body.notification;
  const externalSnsButton = body.external_sns_button;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundFloor = await findActiveFloor(floorId);

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId }).lean();

  if (
    !hasFloorAccess({
      role: decodedUserRole,
      floor: foundFloor,
      uid: decodedUserId,
      floorMember: foundFloorMember,
    })
  ) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const translationEnabled = isGoogleTranslateEnabled();
  const floorTargetLangs = foundFloor.target_langs || [];

  const titleAndDescriptionTranslations = translationEnabled
    ? await translationService.translateTitleAndDescription(
        decodedUserId,
        title,
        description,
        lang,
        floorTargetLangs
      )
    : [];

  const newRoom = {
    floor: floorId,
    user: decodedUserId,
    title,
    description,
    lang,
    translations: titleAndDescriptionTranslations,
    guest_reaction_only: guestReactionOnly,
    member_only: memberOnly,
    room_display_hidden: roomDisplayHidden,
    notification,
    external_sns_button: externalSnsButton,
  };
  const createdRoom = await Room.create(newRoom);
  await createdRoom.populate('user', 'username image_name');
  const populatedRoom = createdRoom;

  try {
    await provisionRoomResources({
      floorId,
      roomId: populatedRoom._id,
      userId: decodedUserId,
      targetLangs: floorTargetLangs,
    });
  } catch (error) {
    await rollbackRoomProvisioning({ floorId, roomId: populatedRoom._id });
    throw error;
  }

  return populatedRoom;
};

exports.update = async (body, jwtPayload, io) => {
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

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);
  const { room: foundRoom, floor: foundFloor } = await findRoomWithFloor(roomId);

  const foundFloorMember = await FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId }).lean();

  if (
    !hasFloorAccess({
      role: decodedUserRole,
      floor: foundFloor,
      uid: decodedUserId,
      floorMember: foundFloorMember,
    })
  ) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  await validateRoomImage({ room: foundRoom, imageName, userId: decodedUserId });

  const isContentModified = foundRoom.title !== title || foundRoom.description !== description;
  const isLangChanged = foundRoom.lang !== lang;
  const translationEnabled = isGoogleTranslateEnabled();
  const floorTargetLangs = foundFloor.target_langs || [];

  let titleAndDescriptionTranslations = [];
  if (translationEnabled && (isContentModified || isLangChanged)) {
    titleAndDescriptionTranslations = await translationService.translateTitleAndDescription(
      decodedUserId,
      title,
      description,
      lang,
      floorTargetLangs
    );
  }

  const updateRoom = {
    title,
    description,
    lang,
    image_name: imageName,
    guest_reaction_only: guestReactionOnly,
    member_only: memberOnly,
    room_display_hidden: roomDisplayHidden,
    notification,
    external_sns_button: externalSnsButton,
    updated_at: Date.now(),
  };
  if (translationEnabled && (isContentModified || isLangChanged)) {
    updateRoom.translations = titleAndDescriptionTranslations;
  }

  const updatedRoom = await Room.findByIdAndUpdate(roomId, updateRoom, { new: true, runValidators: true }).populate(
    'user',
    'username image_name'
  );

  if (updatedRoom && memberOnly === true && foundRoom.member_only !== true) await revalidateRestrictedRoom(io, roomId);

  await removeReplacedRoomImage(foundRoom, imageName);

  return updatedRoom;
};

exports.updateRoomDisplayHidden = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const roomDisplayHidden = body.room_display_hidden;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundFloor = await findActiveFloor(floorId);

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId }).lean();

  if (
    !hasFloorAccess({
      role: decodedUserRole,
      floor: foundFloor,
      uid: decodedUserId,
      floorMember: foundFloorMember,
    })
  ) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const writeResult = await Room.updateMany(
    { floor: floorId, delete_flg: false },
    { room_display_hidden: roomDisplayHidden },
    { runValidators: true }
  );

  return {
    matched: writeResult.matchedCount ?? writeResult.n ?? 0,
    modified: writeResult.modifiedCount ?? writeResult.nModified ?? 0,
  };
};

exports.updateDisplayOrder = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const displayOrders = Array.isArray(body.displayorders)
    ? body.displayorders.map((x) => ({ _id: x._id, display_order: x.display_order }))
    : [];

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundFloor = await findActiveFloor(floorId);

  const foundFloorMember = await FloorMember.findOne({ floor: floorId, user: decodedUserId }).lean();

  if (
    !hasFloorAccess({
      role: decodedUserRole,
      floor: foundFloor,
      uid: decodedUserId,
      floorMember: foundFloorMember,
    })
  ) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  if (displayOrders.length) {
    await Room.bulkWrite(
      displayOrders.map((d) => ({
        updateOne: {
          filter: { _id: d._id, floor: floorId, delete_flg: false },
          update: { $set: { display_order: d.display_order } },
        },
      }))
    );
  }

  return 200;
};

exports.delete = async (body, jwtPayload, io) => {
  const roomId = body._id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);
  const { floor: foundFloor } = await findRoomWithFloor(roomId);

  const foundFloorMember = await FloorMember.findOne({ floor: foundFloor._id, user: decodedUserId }).lean();

  if (
    !hasFloorAccess({
      role: decodedUserRole,
      floor: foundFloor,
      uid: decodedUserId,
      floorMember: foundFloorMember,
    })
  ) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const updateRoom = {
    updated_at: Date.now(),
    delete_flg: true,
    deleted_at: Date.now(),
  };
  const updatedRoom = await withAIAnalysisIntegrityLock(() =>
    Room.findByIdAndUpdate(roomId, updateRoom, { new: true, runValidators: true })
  );

  if (updatedRoom) await revokeRoom(io, roomId);
  return updatedRoom;
};
