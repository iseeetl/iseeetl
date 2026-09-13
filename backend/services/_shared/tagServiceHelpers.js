const { buildPaginationOptions } = require('./paginationHelpers');
const mongoose = require('mongoose');
const { buildDeleteFlagUpdate } = require('./updateHelpers');
const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const translationService = require('../translation.service');
const AppError = require('../../utils/appError');
const {
  assertNoActiveAIAnalysisReferences,
  assertRoomTagParentActive,
  withAIAnalysisIntegrityLock,
} = require('../analysis/settings/referenceIntegrity');

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });

function assertUniqueTagNames(tags) {
  const names = new Set();
  for (const tag of tags) {
    const name = typeof tag?.name === 'string' ? tag.name : '';
    if (!name || names.has(name)) throw invalidParams();
    names.add(name);
  }
}

function buildMutableTagData(tag, scope) {
  const data = { ...tag };
  delete data._id;
  delete data.user;
  delete data.name;
  delete data.created_at;
  delete data.updated_at;
  delete data.deleted_at;
  delete data.delete_flg;
  Object.keys(scope).forEach((key) => delete data[key]);
  return data;
}

const tagReferenceType = (Model) => ({
  CategoryTag: 'category-tag',
  FloorTag: 'floor-tag',
  RoomTag: 'room-tag',
})[Model.modelName];

async function reconcileTagsByName({
  Model,
  scope = {},
  userId,
  tags,
  insertOnlyFields = [],
  inheritance,
}) {
  return withAIAnalysisIntegrityLock(async () => {
    assertUniqueTagNames(tags);

    const usesLogicalDeletion = Model.modelName === 'RoomTag';
    const activeFilter = usesLogicalDeletion ? {} : { delete_flg: false };
    const existingTags = await Model.find({ ...scope, ...activeFilter }).lean();
    assertUniqueTagNames(existingTags);
    const existingNames = new Set(existingTags.map((tag) => tag.name));

    const now = new Date();
    const preserveStoredTranslations = !isGoogleTranslateEnabled();
    const activeNames = tags.map((tag) => tag.name);
    const insertedTags = [];
    const operations = tags.map((tag) => {
      const mutableData = buildMutableTagData(tag, scope);
      const insertTranslations = mutableData.translations ?? [];
      if (preserveStoredTranslations) delete mutableData.translations;
      const insertOnlyData = Object.fromEntries(
        insertOnlyFields
          .filter((field) => tag[field] !== undefined)
          .map((field) => [field, tag[field]])
      );
      insertOnlyFields.forEach((field) => delete mutableData[field]);
      const insertedId = existingNames.has(tag.name) ? null : new mongoose.Types.ObjectId();
      if (insertedId) {
        insertedTags.push({
          ...scope,
          ...tag,
          ...insertOnlyData,
          _id: insertedId,
          user: userId,
        });
      }

      return {
        updateOne: {
          filter: { ...scope, name: tag.name, ...activeFilter },
          update: {
            $set: {
              ...mutableData,
              delete_flg: false,
              ...(usesLogicalDeletion ? { deleted_at: null } : {}),
              updated_at: now,
            },
            $setOnInsert: {
              ...(insertedId ? { _id: insertedId } : {}),
              ...scope,
              user: userId,
              name: tag.name,
              created_at: now,
              ...insertOnlyData,
              ...(preserveStoredTranslations ? { translations: insertTranslations } : {}),
            },
          },
          upsert: true,
        },
      };
    });

    const inheritancePlan =
      inheritance && insertedTags.length
        ? await inheritance.prepare(insertedTags)
        : null;

    const nextNames = new Set(activeNames);
    if (usesLogicalDeletion) {
      for (const tag of existingTags.filter((tag) => tag.delete_flg && nextNames.has(tag.name))) {
        await assertRoomTagParentActive(tag);
      }
    }
    const removedTags = existingTags.filter((tag) => !tag.delete_flg && !nextNames.has(tag.name));
    const referenceType = tagReferenceType(Model);
    for (const tag of removedTags) {
      if (referenceType) await assertNoActiveAIAnalysisReferences(referenceType, tag._id);
    }

    const removalFilter = { ...scope, _id: { $in: removedTags.map((tag) => tag._id) } };
    const removalOperation = usesLogicalDeletion
      ? {
          updateMany: {
            filter: { ...removalFilter, delete_flg: false },
            update: { $set: { delete_flg: true, deleted_at: now, updated_at: now } },
          },
        }
      : { deleteMany: { filter: removalFilter } };
    if (!inheritancePlan) operations.push(removalOperation);

    try {
      await Model.bulkWrite(operations, { ordered: true });
      if (inheritancePlan) {
        await inheritance.commit(inheritancePlan);
        await Model.bulkWrite([removalOperation], { ordered: true });
      }
    } catch (error) {
      if (insertedTags.length) {
        await Promise.allSettled([
          inheritancePlan ? inheritance.rollback(inheritancePlan) : Promise.resolve(),
          Model.deleteMany({ _id: { $in: insertedTags.map((tag) => tag._id) } }),
        ]);
      }
      throw error;
    }
  });
}

function buildManagementPaginateOptions({ page, sort, populate, lean }) {
  return buildPaginationOptions({ page, sort, populate, lean });
}

function buildManagementUpdateData({ order, name }) {
  return {
    order,
    name,
    updated_at: Date.now(),
  };
}

async function resolveTagTranslations({ currentTag, nextTag, userId, targetLangs }) {
  const isNameChanged = currentTag?.name !== nextTag?.name;
  const isLangChanged = currentTag?.lang !== nextTag?.lang;
  if ((!isNameChanged && !isLangChanged) || !isGoogleTranslateEnabled()) {
    return currentTag?.translations;
  }
  return translationService.translateTag(userId, { lang: nextTag?.lang, name: nextTag?.name }, targetLangs);
}

async function buildTranslatedTagDocs({ rows, baseLang, targetLangs, userId, buildBaseDoc }) {
  const translationEnabled = isGoogleTranslateEnabled();
  return Promise.all(
    rows.map(async (row, idx) => {
      const baseDoc = buildBaseDoc(row, idx);
      const translations = translationEnabled
        ? await translationService.translateTag(
            userId,
            { name: baseDoc.name, lang: baseLang },
            targetLangs
          )
        : [];
      return {
        ...baseDoc,
        lang: baseLang,
        translations,
      };
    })
  );
}

async function createTranslatedTag({ Model, data, userId, targetLangs }) {
  const translations = isGoogleTranslateEnabled()
    ? await translationService.translateTag(
        userId,
        { lang: data.lang, name: data.name },
        targetLangs
      )
    : [];
  return withAIAnalysisIntegrityLock(() => Model.create({ ...data, translations }));
}

async function updateTranslatedTag({
  Model,
  filter,
  id,
  currentTag,
  order,
  name,
  lang,
  userId,
  targetLangs,
  byId = false,
  throwIfMissing = false,
}) {
  const translations = await resolveTagTranslations({
    currentTag,
    nextTag: { name, lang },
    userId,
    targetLangs,
  });
  const updateData = { order, name, lang, translations, updated_at: Date.now() };
  const options = { new: true, runValidators: true };
  return withAIAnalysisIntegrityLock(async () => {
    const updated = byId
      ? await Model.findByIdAndUpdate(id, updateData, options)
      : await Model.findOneAndUpdate(filter, updateData, options);
    if (!updated && throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
    return updated;
  });
}

async function deleteTag({ Model, filter, id }) {
  return withAIAnalysisIntegrityLock(async () => {
    const query = filter || { _id: id };
    const current = await Model.findOne(query);
    if (!current) throw new AppError({ code: 'NOT_FOUND' });
    const referenceType = tagReferenceType(Model);
    if (referenceType) await assertNoActiveAIAnalysisReferences(referenceType, current._id);
    const result = await Model.deleteOne({ ...query, _id: current._id });
    if (!result.deletedCount) throw new AppError({ code: 'NOT_FOUND' });
    return { _id: current._id };
  });
}

async function softDeleteTag({ Model, filter, id, byId = false, throwIfMissing = false }) {
  return withAIAnalysisIntegrityLock(async () => {
    const current = byId ? { _id: id } : { _id: filter?._id };
    const referenceType = tagReferenceType(Model);
    if (referenceType && current._id) {
      await assertNoActiveAIAnalysisReferences(referenceType, current._id);
    }
    const now = Date.now();
    const updateData = { updated_at: now, delete_flg: true, deleted_at: now };
    const options = { new: true, runValidators: true };
    const updated = byId
      ? await Model.findByIdAndUpdate(id, updateData, options)
      : await Model.findOneAndUpdate(filter, updateData, options);
    if (!updated && throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
    return updated;
  });
}

const paginateManagedTags = ({ Model, page, query = {}, lean, populate = [] }) =>
  Model.paginate(
    query,
    buildManagementPaginateOptions({
      page,
      sort: { created_at: 'desc' },
      populate: [{ path: 'user', select: 'username' }, ...populate],
      lean,
    })
  );

async function updateManagedTag({
  Model,
  id,
  order,
  name,
  lang,
  userId,
  targetLangs,
  expectedDeleteFlg = false,
  throwIfMissing = false,
}) {
  return withAIAnalysisIntegrityLock(async () => {
    const query = Model.modelName === 'RoomTag' ? { _id: id } : { _id: id, delete_flg: false };
    const currentTag = await Model.findOne(query);
    if (!currentTag) {
      if (throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
      return null;
    }
    if (Model.modelName === 'RoomTag' && currentTag.delete_flg !== expectedDeleteFlg) {
      throw new AppError({ code: 'CONFLICT' });
    }
    const translations = await resolveTagTranslations({
      currentTag,
      nextTag: { name, lang },
      userId,
      targetLangs,
    });
    const updateData = {
      ...buildManagementUpdateData({ order, name }),
      lang,
      translations,
    };
    const options = { new: true, runValidators: true };
    const updated = await Model.findOneAndUpdate(
      { _id: id, delete_flg: expectedDeleteFlg },
      updateData,
      options
    );
    if (!updated) {
      const latestTag = await Model.findOne(query);
      if (latestTag) throw new AppError({ code: 'CONFLICT' });
      if (throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
    }
    return updated;
  });
}

async function setManagedTagDeleteState({ Model, id, deleteFlg, throwIfMissing = false }) {
  return withAIAnalysisIntegrityLock(async () => {
    const currentTag = await Model.findOne({ _id: id });
    if (!currentTag) {
      if (throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
      return null;
    }
    if (currentTag.delete_flg === deleteFlg) return currentTag;

    if (deleteFlg) {
      const referenceType = tagReferenceType(Model);
      if (referenceType) await assertNoActiveAIAnalysisReferences(referenceType, id);
    } else {
      await assertRoomTagParentActive(currentTag);
    }

    const updated = await Model.findOneAndUpdate(
      { _id: id, delete_flg: !deleteFlg },
      {
        ...buildDeleteFlagUpdate({ deleteFlg, alwaysSetDeletedAt: true }),
        updated_at: Date.now(),
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      const latestTag = await Model.findOne({ _id: id });
      if (latestTag) throw new AppError({ code: 'CONFLICT' });
      if (throwIfMissing) throw new AppError({ code: 'NOT_FOUND' });
    }
    return updated;
  });
}

module.exports = {
  assertUniqueTagNames,
  buildManagementPaginateOptions,
  buildManagementUpdateData,
  buildTranslatedTagDocs,
  createTranslatedTag,
  paginateManagedTags,
  reconcileTagsByName,
  resolveTagTranslations,
  deleteTag,
  softDeleteTag,
  setManagedTagDeleteState,
  updateManagedTag,
  updateTranslatedTag,
};
