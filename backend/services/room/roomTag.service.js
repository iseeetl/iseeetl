const AppError = require('../../utils/appError');
const { escapeRegExp } = require('../../utils/regex');

const FloorMember = require('../../models/FloorMember');
const FloorTag = require('../../models/FloorTag');
const Floor = require('../../models/Floor');
const Room = require('../../models/Room');
const RoomTag = require('../../models/RoomTag');

const { findActiveUser, findActiveRoom, findActiveFloor, findRoomWithFloor } = require('../_shared/activeResource');
const { hasFloorAccess } = require('../_shared/floorAccess');
const {
  assertUniqueTagNames,
  reconcileTagsByName,
  buildTranslatedTagDocs,
  createTranslatedTag,
  paginateManagedTags,
  setManagedTagDeleteState,
  softDeleteTag,
  updateManagedTag,
  updateTranslatedTag,
} = require('../_shared/tagServiceHelpers');
const { withOptionalDeleteFlag } = require('../_shared/paginationHelpers');
const { requireAdminUser } = require('../_shared/memberHelpers');
const {
  commitSettingInheritance,
  prepareRoomSettingInheritance,
  rollbackSettingInheritance,
} = require('../analysis/settings/inheritance.service');
const { authorizeRoomMetadataAccess } = require('./roomAccess.service');

const findActiveRoomTags = ({ floorId, roomId }) =>
  RoomTag.find({ floor: floorId, room: roomId, delete_flg: false })
    .sort({ order: 1, created_at: -1 })
    .lean();

// ゲストも利用する一覧だが、取得前にルーム情報へのアクセス権を確認する。
exports.list = async (body, identity) => {
  const roomId = body.room_id;

  const { room: foundRoom } = await authorizeRoomMetadataAccess(roomId, identity);

  const foundRoomTags = await RoomTag.find({ floor: foundRoom.floor.toString(), room: roomId, delete_flg: false })
    .sort({ order: 1, created_at: -1 })
    .lean();

  return foundRoomTags;
};

exports.create = async (body, jwtPayload) => {
  const roomId = body.room_id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;

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

  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];
  return createTranslatedTag({
    Model: RoomTag,
    data: {
      floor: foundRoom.floor.toString(),
      room: roomId,
      user: decodedUserId,
      order,
      name,
      lang,
    },
    userId: decodedUserId,
    targetLangs,
  });
};

exports.update = async (body, jwtPayload) => {
  const id = body._id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundRoomTag = await RoomTag.findOne({ _id: id, delete_flg: false });
  if (!foundRoomTag) throw new AppError({ code: 'NOT_FOUND' });

  await findActiveRoom(foundRoomTag.room.toString());

  const foundFloor = await findActiveFloor(foundRoomTag.floor.toString());

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

  // タグ名と言語が変わらなければ、既存の翻訳を保持する。
  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];
  return updateTranslatedTag({
    Model: RoomTag,
    id,
    currentTag: foundRoomTag,
    order,
    name,
    lang,
    userId: decodedUserId,
    targetLangs,
    byId: true,
    throwIfMissing: true,
  });
};

exports.delete = async (body, jwtPayload) => {
  const id = body._id;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundRoomTag = await RoomTag.findOne({ _id: id, delete_flg: false });
  if (!foundRoomTag) throw new AppError({ code: 'NOT_FOUND' });

  await findActiveRoom(foundRoomTag.room.toString());

  const foundFloor = await findActiveFloor(foundRoomTag.floor.toString());

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

  return softDeleteTag({ Model: RoomTag, id, byId: true, throwIfMissing: true });
};

exports.import = async (body, jwtPayload) => {
  const roomId = body.room_id;
  const rows = Array.isArray(body.csv)
    ? body.csv.map((row) => [row?.[0], String(row?.[1] ?? '').trim()])
    : [];

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

  assertUniqueTagNames(rows.map((row) => ({ name: row[1] })));

  const baseLang = foundFloor.lang || 'ja';
  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];
  const docs = await buildTranslatedTagDocs({
    rows,
    baseLang,
    targetLangs,
    userId: decodedUserId,
    buildBaseDoc: (row, idx) => {
      const order = Number(row?.[0]);
      const name = String(row?.[1] ?? '').trim();
      return {
        floor: foundRoom.floor.toString(),
        room: roomId,
        user: decodedUserId,
        order: Number.isFinite(order) ? order : idx + 1,
        name,
      };
    },
  });

  const floorId = foundRoom.floor.toString();
  await reconcileTagsByName({
    Model: RoomTag,
    scope: { floor: floorId, room: roomId },
    userId: decodedUserId,
    tags: docs,
  });

  return findActiveRoomTags({ floorId, roomId });
};

exports.init = async (body, jwtPayload) => {
  const roomId = body.room_id;

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

  const floorTags = await FloorTag.find({ floor: foundRoom.floor.toString(), delete_flg: false }).lean();
  const docs = floorTags.map((ft) => ({
    floor: foundRoom.floor.toString(),
    room: roomId,
    source_floor_tag: ft._id,
    user: decodedUserId,
    order: ft.order,
    name: ft.name,
    lang: ft.lang || 'ja',
    translations: Array.isArray(ft.translations) ? ft.translations : [],
  }));

  const floorId = foundRoom.floor.toString();
  await reconcileTagsByName({
    Model: RoomTag,
    scope: { floor: floorId, room: roomId },
    userId: decodedUserId,
    tags: docs,
    insertOnlyFields: ['source_floor_tag'],
    inheritance: {
      prepare: (childTags) =>
        prepareRoomSettingInheritance({
          floorId,
          roomId,
          childTags,
          userId: decodedUserId,
        }),
      commit: commitSettingInheritance,
      rollback: rollbackSettingInheritance,
    },
  });

  return findActiveRoomTags({ floorId, roomId });
};

exports.managementPaginate = async (body, jwtPayload) => {
  const page = body.page;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  let query = {};
  if (body.search) {
    query.name = { $regex: escapeRegExp(body.search), $options: 'i' };
  }
  query = withOptionalDeleteFlag(query, body.delete_flg);

  return paginateManagedTags({
    Model: RoomTag,
    page,
    query,
    lean: true,
    populate: [
      { path: 'floor', select: 'title delete_flg' },
      { path: 'room', select: 'title delete_flg floor' },
      { path: 'source_floor_tag', select: 'name delete_flg floor' },
    ],
  });
};

exports.managementUpdate = async (body, jwtPayload) => {
  const id = body._id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;
  const expectedDeleteFlg = body.delete_flg;

  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);
  const currentTag = await RoomTag.findOne({ _id: id });
  if (!currentTag) throw new AppError({ code: 'NOT_FOUND' });
  const room = await Room.findOne({ _id: currentTag.room });
  if (!room) throw new AppError({ code: 'NOT_FOUND' });
  const floor = await Floor.findOne({ _id: room.floor });
  if (!floor) throw new AppError({ code: 'NOT_FOUND' });

  return updateManagedTag({
    Model: RoomTag,
    id,
    order,
    name,
    lang,
    userId: decodedUserId,
    targetLangs: floor.target_langs || [],
    expectedDeleteFlg,
    throwIfMissing: true,
  });
};

exports.managementSetDeleteState = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  return setManagedTagDeleteState({
    Model: RoomTag,
    id: body._id,
    deleteFlg: body.delete_flg,
    throwIfMissing: true,
  });
};
