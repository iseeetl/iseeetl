const AppError = require('../../utils/appError');
const { escapeRegExp } = require('../../utils/regex');

const FloorTag = require('../../models/FloorTag');
const Floor = require('../../models/Floor');
const CategoryTag = require('../../models/CategoryTag');

const translationService = require('../translation.service');
const { findActiveUser, findActiveFloor } = require('../_shared/activeResource');
const { isAdminOrCreator } = require('../_shared/floorAccess');
const {
  assertUniqueTagNames,
  reconcileTagsByName,
  buildTranslatedTagDocs,
  createTranslatedTag,
  paginateManagedTags,
  deleteTag,
  updateManagedTag,
  updateTranslatedTag,
} = require('../_shared/tagServiceHelpers');
const { requireAdminUser } = require('../_shared/memberHelpers');
const {
  commitSettingInheritance,
  prepareFloorSettingInheritance,
  rollbackSettingInheritance,
} = require('../analysis/settings/inheritance.service');

exports.list = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  await findActiveUser(decodedUserId);

  const foundFloor = await findActiveFloor(floorId);

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const foundFloorTags = await FloorTag.find({ floor: floorId, delete_flg: false }).lean();
  return foundFloorTags;
};

exports.create = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId, { error: { code: 'INVALID_PERMISSION' } });

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PERMISSION' } });

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];
  return createTranslatedTag({
    Model: FloorTag,
    data: { floor: floorId, user: decodedUserId, order, name, lang },
    userId: decodedUserId,
    targetLangs,
  });
};

exports.update = async (body, jwtPayload) => {
  const tagId = body._id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;

  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  await findActiveUser(decodedUserId);

  const foundFloorTag = await FloorTag.findOne({ _id: tagId, delete_flg: false });
  if (!foundFloorTag) throw new AppError({ code: 'NOT_FOUND' });

  const foundFloor = await findActiveFloor(foundFloorTag.floor.toString());

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  // タグ名と言語が変わらなければ、既存の翻訳を保持する。
  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];
  return updateTranslatedTag({
    Model: FloorTag,
    filter: { _id: tagId, delete_flg: false },
    currentTag: foundFloorTag,
    order,
    name,
    lang,
    userId: decodedUserId,
    targetLangs,
  });
};

exports.delete = async (body, jwtPayload) => {
  const tagId = body._id;
  const decodedUserId = jwtPayload.user_id;

  const foundUser = await findActiveUser(decodedUserId);

  const foundFloorTag = await FloorTag.findOne({ _id: tagId, delete_flg: false });
  if (!foundFloorTag) throw new AppError({ code: 'NOT_FOUND' });

  const foundFloor = await findActiveFloor(foundFloorTag.floor.toString());

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(foundUser.role, foundFloor.user.toString(), foundUser._id.toString())) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  return deleteTag({
    Model: FloorTag,
    filter: { _id: tagId, delete_flg: false },
  });
};

exports.import = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const rows = body.csv.map((row) => [row[0], String(row[1] ?? '').trim()]);
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
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
      const order = Number(row[0]);
      const name = String(row[1]).trim();
      return {
        floor: floorId,
        user: decodedUserId,
        order: Number.isFinite(order) ? order : idx + 1,
        name,
      };
    },
  });

  await reconcileTagsByName({
    Model: FloorTag,
    scope: { floor: floorId },
    userId: decodedUserId,
    tags: docs,
  });

  return FloorTag.find({ floor: floorId, delete_flg: false })
    .sort({ order: 1, created_at: -1 })
    .lean();
};

// 共通タグを基にフロアタグを初期化する。既存フロアのタグを共通タグに合わせ直す場合にも使う。
exports.init = async (body, jwtPayload) => {
  const floorId = body.floor_id;
  const decodedUserRole = jwtPayload.user_role;
  const decodedUserId = jwtPayload.user_id;

  const foundFloor = await findActiveFloor(floorId, { error: { code: 'INVALID_PARAMS' } });

  // サイト管理者、またはフロアを作成したフロア編集者だけに許可する。
  if (!isAdminOrCreator(decodedUserRole, foundFloor.user.toString(), decodedUserId)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  const targetLangs = Array.isArray(foundFloor.target_langs) ? foundFloor.target_langs : [];

  const categoryTags = await CategoryTag.find({ delete_flg: false }).lean();
  assertUniqueTagNames(categoryTags);

  const newDocs = await Promise.all(
    categoryTags.map(async (ct) => {
      const baseLang = ct.lang || 'ja';
      const translations = await translationService.translateTag(
        decodedUserId,
        { _id: ct._id, name: ct.name, lang: baseLang },
        targetLangs
      );
      return {
        floor: floorId,
        source_category_tag: ct._id,
        user: decodedUserId,
        order: ct.order,
        name: ct.name,
        lang: baseLang,
        translations,
      };
    })
  );

  await reconcileTagsByName({
    Model: FloorTag,
    scope: { floor: floorId },
    userId: decodedUserId,
    tags: newDocs,
    insertOnlyFields: ['source_category_tag'],
    inheritance: {
      prepare: (childTags) =>
        prepareFloorSettingInheritance({
          floorId,
          childTags,
          userId: decodedUserId,
        }),
      commit: commitSettingInheritance,
      rollback: rollbackSettingInheritance,
    },
  });

  return FloorTag.find({ floor: floorId, delete_flg: false })
    .sort({ order: 1, created_at: -1 })
    .lean();
};

exports.managementPaginate = async (body, jwtPayload) => {
  const page = body.page;
  const search = body.search;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);

  let query = {};
  if (search) {
    const pattern = escapeRegExp(search);
    query = {
      $or: [{ name: { $regex: pattern, $options: 'i' } }],
    };
  }

  return paginateManagedTags({
    Model: FloorTag,
    page,
    query: { ...query, delete_flg: false },
    populate: [
      { path: 'floor', select: 'title delete_flg' },
      { path: 'source_category_tag', select: 'name delete_flg' },
    ],
  });
};

exports.managementUpdate = async (body, jwtPayload) => {
  const tagId = body._id;
  const order = body.order;
  const name = body.name;
  const lang = body.lang;
  const decodedUserId = jwtPayload.user_id;

  await requireAdminUser(decodedUserId);
  const currentTag = await FloorTag.findOne({ _id: tagId, delete_flg: false });
  if (!currentTag) throw new AppError({ code: 'NOT_FOUND' });
  const floor = await Floor.findOne({ _id: currentTag.floor });
  if (!floor) throw new AppError({ code: 'NOT_FOUND' });

  return updateManagedTag({
    Model: FloorTag,
    id: tagId,
    order,
    name,
    lang,
    userId: decodedUserId,
    targetLangs: floor.target_langs || [],
  });
};

exports.managementDelete = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  return deleteTag({
    Model: FloorTag,
    id: body._id,
  });
};
