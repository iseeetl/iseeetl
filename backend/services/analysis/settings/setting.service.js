const AppError = require('../../../utils/appError');
const {
  MAX_ACTIVE_SETTINGS_PER_SCOPE,
} = require('../../../constants/aiAnalysisSettings');
const { escapeRegExp } = require('../../../utils/regex');
const { withKeyedLocks } = require('../../../utils/keyedLock');
const {
  parentKey,
  referenceKey,
  scopeKey,
  withAIAnalysisIntegrityLock,
} = require('./referenceIntegrity');
const { findActiveFloor, findActiveRoom, findActiveUser } = require('../../_shared/activeResource');
const { isAdminOrCreator } = require('../../_shared/floorAccess');
const { requireAdminUser } = require('../../_shared/memberHelpers');

const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const CategoryTag = require('../../../models/CategoryTag');
const FloorTag = require('../../../models/FloorTag');
const RoomTag = require('../../../models/RoomTag');
const User = require('../../../models/User');
const { normalizeEnvValue } = require('../../../config/env');

const POPULATE = Object.freeze({
  common: [
    { path: 'category_tag', select: 'name lang translations delete_flg' },
    { path: 'result_user', select: 'username image_name delete_flg' },
  ],
  floor: [
    { path: 'floor_tag', select: 'name lang translations source_category_tag delete_flg' },
    { path: 'result_user', select: 'username image_name delete_flg' },
  ],
  room: [
    { path: 'room_tag', select: 'name lang translations source_floor_tag delete_flg' },
    { path: 'result_user', select: 'username image_name delete_flg' },
  ],
});

const normalizeId = (value) => {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value._id != null && value._id !== value) return normalizeId(value._id);
  return '';
};

const includeReferenceDeleteFlag = (serialized, value, includeDeleteFlg) => {
  if (includeDeleteFlg && typeof value?.delete_flg === 'boolean') {
    serialized.delete_flg = value.delete_flg;
  }
  return serialized;
};

const publicUser = (value, { includeDeleteFlg = false } = {}) =>
  includeReferenceDeleteFlag(
    value && typeof value === 'object' && value.username !== undefined
      ? { _id: normalizeId(value), username: value.username, image_name: value.image_name ?? null }
      : { _id: normalizeId(value) },
    value,
    includeDeleteFlg
  );

const publicTag = (value, { includeDeleteFlg = false } = {}) => {
  if (!value || typeof value !== 'object' || value.name === undefined) {
    return { _id: normalizeId(value) };
  }
  return includeReferenceDeleteFlag(
    {
      _id: normalizeId(value),
      name: value.name,
      lang: value.lang ?? null,
      translations: Array.isArray(value.translations)
        ? value.translations.map(({ lang, name }) => ({ lang, name }))
        : [],
    },
    value,
    includeDeleteFlg
  );
};

const serializeSetting = (setting, type, { includeReferenceDeleteFlg = false } = {}) => {
  const value = typeof setting?.toObject === 'function' ? setting.toObject() : setting;
  const tagField = type === 'common' ? 'category_tag' : type === 'floor' ? 'floor_tag' : 'room_tag';
  const serialized = {
    _id: normalizeId(value),
    scope: type === 'common' ? 'category_tag' : type,
    tag: publicTag(value[tagField], { includeDeleteFlg: includeReferenceDeleteFlg }),
    analysis_kind: value.analysis_kind,
    additional_prompt: value.additional_prompt,
    result_user: publicUser(value.result_user, { includeDeleteFlg: includeReferenceDeleteFlg }),
    revision: value.revision,
  };
  if (type === 'floor') {
    serialized.floor = normalizeId(value.floor);
    serialized.source = value.source_master_setting
      ? {
          setting_id: normalizeId(value.source_master_setting),
          revision: value.source_master_revision,
        }
      : null;
  }
  if (type === 'room') {
    serialized.floor = normalizeId(value.floor);
    serialized.room = normalizeId(value.room);
    serialized.source = value.source_floor_setting
      ? {
          setting_id: normalizeId(value.source_floor_setting),
          revision: value.source_floor_revision,
        }
      : null;
  }
  return serialized;
};

const sortSettings = (settings) =>
  settings.sort((left, right) => {
    const tagOrder = String(left.tag?.name || '').localeCompare(String(right.tag?.name || ''), 'ja');
    if (tagOrder !== 0) return tagOrder;
    const kindOrder = left.analysis_kind.localeCompare(right.analysis_kind);
    if (kindOrder !== 0) return kindOrder;
    return left._id.localeCompare(right._id);
  });

const buildPage = ({ docs, total, page, limit = 10 }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    docs,
    total,
    limit,
    pages,
    page,
    pagingCounter: start + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < pages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < pages ? page + 1 : null,
  };
};

const buildCommonPaginatePipeline = ({ page, search, limit = 10 }) => {
  // 旧版で論理削除された設定を一覧へ戻さない。
  const pipeline = [{ $match: { delete_flg: false } }];

  pipeline.push(
    {
      $lookup: {
        from: CategoryTag.collection.name,
        localField: 'category_tag',
        foreignField: '_id',
        as: 'category_tag',
      },
    },
    { $unwind: { path: '$category_tag', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'result_user',
        foreignField: '_id',
        as: 'result_user',
      },
    },
    { $unwind: { path: '$result_user', preserveNullAndEmptyArrays: true } }
  );

  if (search) {
    const matcher = new RegExp(escapeRegExp(search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'category_tag.name': { $regex: matcher } },
          { 'category_tag.translations.name': { $regex: matcher } },
          { analysis_kind: { $regex: matcher } },
          { 'result_user.username': { $regex: matcher } },
        ],
      },
    });
  }

  const start = (page - 1) * limit;
  pipeline.push(
    { $sort: { 'category_tag.name': 1, analysis_kind: 1, _id: 1 } },
    {
      $project: {
        category_tag: {
          _id: '$category_tag._id',
          name: '$category_tag.name',
          lang: '$category_tag.lang',
          translations: '$category_tag.translations',
          delete_flg: '$category_tag.delete_flg',
        },
        analysis_kind: 1,
        additional_prompt: 1,
        result_user: {
          _id: '$result_user._id',
          username: '$result_user.username',
          image_name: '$result_user.image_name',
          delete_flg: '$result_user.delete_flg',
        },
        revision: 1,
        delete_flg: 1,
      },
    },
    {
      $facet: {
        docs: [{ $skip: start }, { $limit: limit }],
        metadata: [{ $count: 'total' }],
      },
    }
  );
  return pipeline;
};

const findPopulated = (Model, filter, type) =>
  Model.find(filter).populate(POPULATE[type]).lean();

const serializePopulated = async (Model, id, type) => {
  const setting = await Model.findById(id).populate(POPULATE[type]).lean();
  if (!setting) throw new AppError({ code: 'NOT_FOUND' });
  return serializeSetting(setting, type);
};

const assertTagPrefixFits = (tag) => {
  const names = [tag.name, ...(tag.translations || []).map((translation) => translation.name)];
  if (names.some((name) => typeof name === 'string' && `${name}: `.length > 400)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
};

const findActiveResultUser = async (id) => {
  const resultUser = await User.findOne({ _id: id, delete_flg: false }).select('_id username image_name');
  if (!resultUser) throw new AppError({ code: 'INVALID_PARAMS' });
  return resultUser;
};

const assertScopeCapacity = async (Model, scope) => {
  const count = await Model.countDocuments({ ...scope, delete_flg: false });
  if (count >= MAX_ACTIVE_SETTINGS_PER_SCOPE) throw new AppError({ code: 'CONFLICT' });
};

const assertRevisionCanIncrement = (revision) => {
  if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) {
    throw new AppError({ code: 'CONFLICT' });
  }
};

const translateDuplicateError = (error) => {
  if (error?.code === 11000) throw new AppError({ code: 'CONFLICT' });
  throw error;
};

const authorizeFloor = async (floorId, jwtPayload) => {
  const [actor, floor] = await Promise.all([
    findActiveUser(jwtPayload.user_id),
    findActiveFloor(floorId),
  ]);
  if (!isAdminOrCreator(actor.role, floor.user, actor._id)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }
  return { actor, floor };
};

const authorizeRoom = async (roomId, jwtPayload) => {
  const room = await findActiveRoom(roomId);
  const { actor, floor } = await authorizeFloor(room.floor, jwtPayload);
  return { actor, floor, room };
};

const assertFloorTag = async (floorId, floorTagId) => {
  const tag = await FloorTag.findOne({ _id: floorTagId, floor: floorId, delete_flg: false }).lean();
  if (!tag) throw new AppError({ code: 'INVALID_PARAMS' });
  assertTagPrefixFits(tag);
  return tag;
};

const assertRoomTag = async ({ floorId, roomId, roomTagId }) => {
  const tag = await RoomTag.findOne({
    _id: roomTagId,
    floor: floorId,
    room: roomId,
    delete_flg: false,
  }).lean();
  if (!tag) throw new AppError({ code: 'INVALID_PARAMS' });
  assertTagPrefixFits(tag);
  return tag;
};

const createCommon = async (body, jwtPayload) => {
  const actor = await requireAdminUser(jwtPayload.user_id);
  return withKeyedLocks(
    [
      scopeKey('common'),
      referenceKey('category-tag', body.category_tag),
      referenceKey('user', body.result_user),
      parentKey('master', body.category_tag, body.analysis_kind),
    ],
    async () => {
      const [tag, resultUser] = await Promise.all([
        CategoryTag.findOne({ _id: body.category_tag, delete_flg: false }).lean(),
        findActiveResultUser(body.result_user),
      ]);
      if (!tag) throw new AppError({ code: 'INVALID_PARAMS' });
      assertTagPrefixFits(tag);
      await assertScopeCapacity(AIAnalysisSetting, {});
      try {
        const created = await AIAnalysisSetting.create({
          category_tag: tag._id,
          analysis_kind: body.analysis_kind,
          additional_prompt: body.additional_prompt,
          result_user: resultUser._id,
          revision: 1,
          user: actor._id,
          updated_by: actor._id,
        });
        return serializePopulated(AIAnalysisSetting, created._id, 'common');
      } catch (error) {
        return translateDuplicateError(error);
      }
    }
  );
};

const updateCommon = async (body, jwtPayload) => {
  const actor = await requireAdminUser(jwtPayload.user_id);
  const current = await AIAnalysisSetting.findOne({ _id: body._id, delete_flg: false }).lean();
  if (!current) throw new AppError({ code: 'NOT_FOUND' });
  return withKeyedLocks(
    [
      scopeKey('common'),
      referenceKey('category-tag', current.category_tag),
      referenceKey('category-tag', body.category_tag),
      referenceKey('user', current.result_user),
      referenceKey('user', body.result_user),
      parentKey('master', current.category_tag, current.analysis_kind),
      parentKey('master', body.category_tag, body.analysis_kind),
    ],
    async () => {
      assertRevisionCanIncrement(current.revision);
      const [tag, resultUser] = await Promise.all([
        CategoryTag.findOne({ _id: body.category_tag, delete_flg: false }).lean(),
        findActiveResultUser(body.result_user),
      ]);
      if (!tag) throw new AppError({ code: 'INVALID_PARAMS' });
      assertTagPrefixFits(tag);
      try {
        const updated = await AIAnalysisSetting.findOneAndUpdate(
          { _id: body._id, revision: body.revision, delete_flg: false },
          {
            $set: {
              category_tag: tag._id,
              analysis_kind: body.analysis_kind,
              additional_prompt: body.additional_prompt,
              result_user: resultUser._id,
              updated_by: actor._id,
              updated_at: new Date(),
            },
            $inc: { revision: 1 },
          },
          { new: true, runValidators: true }
        );
        if (!updated) throw new AppError({ code: 'CONFLICT' });
        return serializePopulated(AIAnalysisSetting, updated._id, 'common');
      } catch (error) {
        return translateDuplicateError(error);
      }
    }
  );
};

const deleteCommon = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  const current = await AIAnalysisSetting.findById(body._id).lean();
  if (!current) throw new AppError({ code: 'NOT_FOUND' });
  return withKeyedLocks(
    [
      scopeKey('common'),
      referenceKey('category-tag', current.category_tag),
      referenceKey('user', current.result_user),
      parentKey('master', current.category_tag, current.analysis_kind),
    ],
    async () => {
      const deleted = await AIAnalysisSetting.deleteOne({ _id: body._id, revision: body.revision });
      if (deleted.deletedCount !== 1) throw new AppError({ code: 'CONFLICT' });
      return { _id: normalizeId(current) };
    }
  );
};

const listCommon = async (jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  const settings = await findPopulated(AIAnalysisSetting, { delete_flg: false }, 'common');
  return sortSettings(settings.map((setting) => serializeSetting(setting, 'common')));
};

const paginateCommon = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  const limit = 10;
  const pipeline = buildCommonPaginatePipeline({
    page: body.page,
    search: body.search,
    limit,
  });
  const [result = { docs: [], metadata: [] }] = await AIAnalysisSetting.aggregate(pipeline).collation({ locale: 'ja' });
  const total = result.metadata[0]?.total || 0;
  return buildPage({
    docs: result.docs.map((setting) =>
      serializeSetting(setting, 'common', { includeReferenceDeleteFlg: true })
    ),
    total,
    page: body.page,
    limit,
  });
};

const createFloor = async (body, jwtPayload) => {
  const { actor, floor } = await authorizeFloor(body.floor_id, jwtPayload);
  return withKeyedLocks(
    [
      scopeKey('floor', body.floor_id),
      referenceKey('floor', body.floor_id),
      referenceKey('floor-tag', body.floor_tag),
      referenceKey('user', body.result_user),
    ],
    async () => {
      const [tag, resultUser] = await Promise.all([
        assertFloorTag(floor._id, body.floor_tag),
        findActiveResultUser(body.result_user),
      ]);
      await assertScopeCapacity(FloorAIAnalysisSetting, { floor: floor._id });
      try {
        const created = await FloorAIAnalysisSetting.create({
          floor: floor._id,
          floor_tag: tag._id,
          analysis_kind: body.analysis_kind,
          additional_prompt: body.additional_prompt,
          result_user: resultUser._id,
          source_master_setting: null,
          source_master_revision: null,
          revision: 1,
          user: actor._id,
          updated_by: actor._id,
        });
        return serializePopulated(FloorAIAnalysisSetting, created._id, 'floor');
      } catch (error) {
        return translateDuplicateError(error);
      }
    }
  );
};

const createRoom = async (body, jwtPayload) => {
  const { actor, floor, room } = await authorizeRoom(body.room_id, jwtPayload);
  if (normalizeId(floor) !== normalizeId(body.floor_id)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  return withKeyedLocks(
    [
      scopeKey('room', body.room_id),
      referenceKey('floor', body.floor_id),
      referenceKey('room', body.room_id),
      referenceKey('room-tag', body.room_tag),
      referenceKey('user', body.result_user),
    ],
    async () => {
      const [tag, resultUser] = await Promise.all([
        assertRoomTag({ floorId: floor._id, roomId: room._id, roomTagId: body.room_tag }),
        findActiveResultUser(body.result_user),
      ]);
      await assertScopeCapacity(RoomAIAnalysisSetting, { room: room._id });
      try {
        const created = await RoomAIAnalysisSetting.create({
          floor: floor._id,
          room: room._id,
          room_tag: tag._id,
          analysis_kind: body.analysis_kind,
          additional_prompt: body.additional_prompt,
          result_user: resultUser._id,
          source_floor_setting: null,
          source_floor_revision: null,
          revision: 1,
          user: actor._id,
          updated_by: actor._id,
        });
        return serializePopulated(RoomAIAnalysisSetting, created._id, 'room');
      } catch (error) {
        return translateDuplicateError(error);
      }
    }
  );
};

const resolveScopedModel = (type) =>
  type === 'floor'
    ? { Model: FloorAIAnalysisSetting, tagField: 'floor_tag' }
    : { Model: RoomAIAnalysisSetting, tagField: 'room_tag' };

const loadScopedContext = async (type, current, jwtPayload) => {
  if (type === 'floor') {
    return authorizeFloor(current.floor, jwtPayload);
  }
  return authorizeRoom(current.room, jwtPayload);
};

const assertRequestedScope = (type, body, context) => {
  if (normalizeId(body.floor_id) !== normalizeId(context.floor)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  if (type === 'room' && normalizeId(body.room_id) !== normalizeId(context.room)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
};

const resolveScopedTag = async ({ type, context, tagId }) => {
  if (type === 'floor') {
    return assertFloorTag(context.floor._id, tagId);
  }
  return assertRoomTag({
    floorId: context.floor._id,
    roomId: context.room._id,
    roomTagId: tagId,
  });
};

const updateScoped = async (type, body, jwtPayload) => {
  const { Model, tagField } = resolveScopedModel(type);
  const current = await Model.findById(body._id).lean();
  if (!current) throw new AppError({ code: 'NOT_FOUND' });
  const context = await loadScopedContext(type, current, jwtPayload);
  assertRequestedScope(type, body, context);
  return withKeyedLocks(
    [
      scopeKey(type, normalizeId(type === 'floor' ? context.floor : context.room)),
      referenceKey('floor', context.floor._id),
      ...(type === 'room' ? [referenceKey('room', context.room._id)] : []),
      referenceKey(`${type}-tag`, body[tagField]),
      referenceKey('user', current.result_user),
      referenceKey('user', body.result_user),
    ],
    async () => {
      assertRevisionCanIncrement(current.revision);
      const [tag, resultUser] = await Promise.all([
        resolveScopedTag({
          type,
          context,
          tagId: body[tagField],
        }),
        findActiveResultUser(body.result_user),
      ]);
      try {
        const updated = await Model.findOneAndUpdate(
          { _id: body._id, revision: body.revision, delete_flg: false },
          {
            $set: {
              [tagField]: tag._id,
              analysis_kind: body.analysis_kind,
              additional_prompt: body.additional_prompt,
              result_user: resultUser._id,
              updated_by: context.actor._id,
              updated_at: new Date(),
            },
            $inc: { revision: 1 },
          },
          { new: true, runValidators: true }
        );
        if (!updated) throw new AppError({ code: 'CONFLICT' });
        return serializePopulated(Model, updated._id, type);
      } catch (error) {
        return translateDuplicateError(error);
      }
    }
  );
};

const deleteScoped = async (type, body, jwtPayload) => {
  const { Model, tagField } = resolveScopedModel(type);
  const current = await Model.findById(body._id).lean();
  if (!current) throw new AppError({ code: 'NOT_FOUND' });
  const context = await loadScopedContext(type, current, jwtPayload);
  assertRequestedScope(type, body, context);
  return withKeyedLocks(
    [
      scopeKey(type, normalizeId(type === 'floor' ? context.floor : context.room)),
      referenceKey('floor', context.floor._id),
      ...(type === 'room' ? [referenceKey('room', context.room._id)] : []),
      referenceKey(`${type}-tag`, current[tagField]),
      referenceKey('user', current.result_user),
      referenceKey(`${type}-setting`, current._id),
    ],
    async () => {
      const removed = await Model.deleteOne({ _id: body._id, revision: body.revision });
      if (!removed.deletedCount) {
        const latest = await Model.findById(body._id).lean();
        throw new AppError({ code: latest ? 'CONFLICT' : 'NOT_FOUND' });
      }
      return { _id: current._id };
    }
  );
};

const listScoped = async (type, body, jwtPayload) => {
  const { Model } = resolveScopedModel(type);
  const context = type === 'floor'
    ? await authorizeFloor(body.floor_id, jwtPayload)
    : await authorizeRoom(body.room_id, jwtPayload);
  assertRequestedScope(type, body, context);
  const filter = type === 'floor'
    ? { floor: context.floor._id, delete_flg: false }
    : { room: context.room._id, delete_flg: false };
  const settings = await findPopulated(Model, filter, type);
  return sortSettings(settings.map((setting) => serializeSetting(setting, type)));
};

const findResultUsers = (body) => {
  const pattern = escapeRegExp(body.search || '');
  return User.find({
    delete_flg: false,
    username: { $regex: pattern, $options: 'i' },
  })
    .select('_id username image_name')
    .sort({ username: 1, _id: 1 })
    .lean();
};

const searchResultUsers = async (body, jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  return findResultUsers(body);
};

const findDefaultResultUser = async () => {
  const userId = normalizeEnvValue(process.env.SUPPORT_USER_ID);
  if (!/^[a-f\d]{24}$/i.test(userId)) return null;
  const user = await User.findOne({ _id: userId, delete_flg: false })
    .select('_id username image_name');
  return user ? publicUser(user) : null;
};

const getDefaultResultUser = async (jwtPayload) => {
  await requireAdminUser(jwtPayload.user_id);
  return findDefaultResultUser();
};

const getScopedDefaultResultUser = async (type, body, jwtPayload) => {
  const context = type === 'floor'
    ? await authorizeFloor(body.floor_id, jwtPayload)
    : await authorizeRoom(body.room_id, jwtPayload);
  assertRequestedScope(type, body, context);
  return findDefaultResultUser();
};

const searchScopedResultUsers = async (type, body, jwtPayload) => {
  const context = type === 'floor'
    ? await authorizeFloor(body.floor_id, jwtPayload)
    : await authorizeRoom(body.room_id, jwtPayload);
  assertRequestedScope(type, body, context);
  return findResultUsers(body);
};

module.exports = {
  createCommon: (...args) => withAIAnalysisIntegrityLock(() => createCommon(...args)),
  createFloor: (...args) => withAIAnalysisIntegrityLock(() => createFloor(...args)),
  createRoom: (...args) => withAIAnalysisIntegrityLock(() => createRoom(...args)),
  listCommon,
  listScoped,
  paginateCommon,
  getDefaultResultUser,
  getScopedDefaultResultUser,
  searchResultUsers,
  searchScopedResultUsers,
  serializeSetting,
  deleteCommon: (...args) => withAIAnalysisIntegrityLock(() => deleteCommon(...args)),
  deleteScoped: (...args) => withAIAnalysisIntegrityLock(() => deleteScoped(...args)),
  updateCommon: (...args) => withAIAnalysisIntegrityLock(() => updateCommon(...args)),
  updateScoped: (...args) => withAIAnalysisIntegrityLock(() => updateScoped(...args)),
};
