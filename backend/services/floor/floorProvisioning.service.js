const path = require('path');
const fsPromises = require('fs').promises;
const mongoose = require('mongoose');

const CategoryTag = require('../../models/CategoryTag');
const Floor = require('../../models/Floor');
const FloorTag = require('../../models/FloorTag');
const QuickTextGroup = require('../../models/QuickTextGroup');
const QuickTextItem = require('../../models/QuickTextItem');
const FloorQuickTextGroup = require('../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../models/FloorQuickTextItem');
const Room = require('../../models/Room');
const RoomTag = require('../../models/RoomTag');
const RoomQuickTextGroup = require('../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../models/RoomQuickTextItem');
const translationService = require('../translation.service');
const {
  commitSettingInheritance,
  prepareFloorSettingInheritance,
  rollbackFloorSettingInheritance,
  rollbackSettingInheritance,
} = require('../analysis/settings/inheritance.service');
const { withAIAnalysisIntegrityLock } = require('../analysis/settings/referenceIntegrity');

const targetLanguagesChanged = (previous, next) => {
  const left = Array.isArray(previous) ? [...new Set(previous)].sort() : [];
  const right = Array.isArray(next) ? [...new Set(next)].sort() : [];
  return left.length !== right.length || left.some((value, index) => value !== right[index]);
};

const cloneFloorTags = async ({ floorId, userId, targetLangs }) => {
  const categoryTags = await CategoryTag.find({ delete_flg: false }).lean();
  const documents = await Promise.all(
    categoryTags.map(async (tag) => ({
      _id: new mongoose.Types.ObjectId(),
      floor: floorId,
      source_category_tag: tag._id,
      user: userId,
      order: tag.order,
      name: tag.name,
      lang: tag.lang || 'ja',
      translations: await translationService.translateTag(userId, tag, targetLangs),
    }))
  );
  if (!documents.length) return;

  await withAIAnalysisIntegrityLock(async () => {
    let inheritancePlan = null;
    try {
      await FloorTag.create(documents);
      inheritancePlan = await prepareFloorSettingInheritance({
        floorId,
        childTags: documents,
        userId,
      });
      await commitSettingInheritance(inheritancePlan);
    } catch (error) {
      await Promise.allSettled([
        inheritancePlan ? rollbackSettingInheritance(inheritancePlan) : Promise.resolve(),
        FloorTag.deleteMany({ _id: { $in: documents.map((tag) => tag._id) } }),
      ]);
      throw error;
    }
  });
};

const cloneFloorQuickTexts = async ({ floorId, userId, targetLangs }) => {
  const groups = await QuickTextGroup.find({}).lean();
  const groupDocuments = await Promise.all(
    groups.map(async (group) => ({
      floor: floorId,
      user: userId,
      order: group.order,
      title: group.title,
      lang: group.lang,
      translations: await translationService.translateQuickTextGroup(userId, group, targetLangs),
    }))
  );
  const createdGroups = groupDocuments.length ? await FloorQuickTextGroup.create(groupDocuments) : [];
  const groupIds = new Map(
    groups
      .map((group, index) => [String(group._id), createdGroups[index]?._id])
      .filter(([, createdId]) => createdId)
  );

  const sourceGroupIds = groups.map((group) => group._id);
  const items = sourceGroupIds.length
    ? await QuickTextItem.find({ group: { $in: sourceGroupIds } }).lean()
    : [];
  const itemDocuments = (await Promise.all(
    items.map(async (item) => {
      const group = groupIds.get(String(item.group));
      if (!group) return null;
      return {
        floor: floorId,
        group,
        order: item.order,
        label: item.label,
        lang: item.lang,
        translations: await translationService.translateQuickTextItem(userId, item, targetLangs),
      };
    })
  )).filter(Boolean);
  if (itemDocuments.length) await FloorQuickTextItem.create(itemDocuments);
};

const provisionFloorResources = async ({ floorId, userId, targetLangs, mediaRoot = process.env.MEDIA_PATH }) => {
  await cloneFloorTags({ floorId, userId, targetLangs });
  await cloneFloorQuickTexts({ floorId, userId, targetLangs });
  await fsPromises.mkdir(path.join(mediaRoot, String(floorId)), { recursive: true });
};

const refreshFloorResourceTranslations = async ({ floorId, userId, targetLangs }) => {
  const floorTags = await FloorTag.find({ floor: floorId, delete_flg: false });
  await Promise.all(
    floorTags.map(async (tag) => {
      tag.translations = await translationService.translateTag(
        userId,
        { _id: tag._id, name: tag.name, lang: tag.lang },
        targetLangs
      );
      await tag.save();
    })
  );

  const groups = await FloorQuickTextGroup.find({ floor: floorId });
  await Promise.all(
    groups.map(async (group) => {
      group.translations = await translationService.translateQuickTextGroup(
        userId,
        { _id: group._id, title: group.title, lang: group.lang },
        targetLangs
      );
      await group.save();
    })
  );

  const items = await FloorQuickTextItem.find({ floor: floorId });
  await Promise.all(
    items.map(async (item) => {
      item.translations = await translationService.translateQuickTextItem(
        userId,
        { _id: item._id, label: item.label, lang: item.lang },
        targetLangs
      );
      await item.save();
    })
  );

  const rooms = await Room.find({ floor: floorId });
  await Promise.all(
    rooms.map(async (room) => {
      room.translations = await translationService.translateTitleAndDescription(
        userId,
        room.title,
        room.description,
        room.lang || 'ja',
        targetLangs
      );
      await room.save();
    })
  );

  const roomTags = await RoomTag.find({ floor: floorId, delete_flg: false });
  await Promise.all(
    roomTags.map(async (tag) => {
      tag.translations = await translationService.translateTag(
        userId,
        { _id: tag._id, name: tag.name, lang: tag.lang || 'ja' },
        targetLangs
      );
      await tag.save();
    })
  );

  const roomGroups = await RoomQuickTextGroup.find({ floor: floorId });
  await Promise.all(
    roomGroups.map(async (group) => {
      group.translations = await translationService.translateQuickTextGroup(userId, group, targetLangs);
      await group.save();
    })
  );

  const roomItems = await RoomQuickTextItem.find({ floor: floorId });
  await Promise.all(
    roomItems.map(async (item) => {
      item.translations = await translationService.translateQuickTextItem(userId, item, targetLangs);
      await item.save();
    })
  );
};

const rollbackFloorProvisioning = async ({ floorId, mediaRoot = process.env.MEDIA_PATH }) => {
  await Promise.allSettled([
    withAIAnalysisIntegrityLock(() =>
      Promise.allSettled([
        rollbackFloorSettingInheritance({ floorId }),
        FloorQuickTextItem.deleteMany({ floor: floorId }),
        FloorQuickTextGroup.deleteMany({ floor: floorId }),
        FloorTag.deleteMany({ floor: floorId }),
        Floor.findByIdAndDelete(floorId),
      ])
    ),
    fsPromises.rm(path.join(mediaRoot, String(floorId)), { recursive: true, force: true }),
  ]);
};

module.exports = {
  provisionFloorResources,
  refreshFloorResourceTranslations,
  rollbackFloorProvisioning,
  targetLanguagesChanged,
};
