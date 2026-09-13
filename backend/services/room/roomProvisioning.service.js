const path = require('path');
const fsPromises = require('fs').promises;
const mongoose = require('mongoose');

const FloorTag = require('../../models/FloorTag');
const FloorQuickTextGroup = require('../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../models/FloorQuickTextItem');
const Room = require('../../models/Room');
const RoomTag = require('../../models/RoomTag');
const RoomQuickTextGroup = require('../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../models/RoomQuickTextItem');
const translationService = require('../translation.service');
const {
  commitSettingInheritance,
  prepareRoomSettingInheritance,
  rollbackRoomSettingInheritance,
  rollbackSettingInheritance,
} = require('../analysis/settings/inheritance.service');
const { withAIAnalysisIntegrityLock } = require('../analysis/settings/referenceIntegrity');

const cloneRoomTags = async ({ floorId, roomId, userId, targetLangs }) => {
  const floorTags = await FloorTag.find({ floor: floorId, delete_flg: false });
  const documents = [];
  for (const tag of floorTags) {
    documents.push({
      _id: new mongoose.Types.ObjectId(),
      floor: floorId,
      room: roomId,
      source_floor_tag: tag._id,
      user: userId,
      order: tag.order,
      name: tag.name,
      lang: tag.lang || 'ja',
      translations: await translationService.translateTag(userId, tag, targetLangs),
    });
  }
  if (!documents.length) return;

  await withAIAnalysisIntegrityLock(async () => {
    let inheritancePlan = null;
    try {
      await RoomTag.create(documents);
      inheritancePlan = await prepareRoomSettingInheritance({
        floorId,
        roomId,
        childTags: documents,
        userId,
      });
      await commitSettingInheritance(inheritancePlan);
    } catch (error) {
      await Promise.allSettled([
        inheritancePlan ? rollbackSettingInheritance(inheritancePlan) : Promise.resolve(),
        RoomTag.deleteMany({ _id: { $in: documents.map((tag) => tag._id) } }),
      ]);
      throw error;
    }
  });
};

const cloneRoomQuickTexts = async ({ floorId, roomId, userId }) => {
  const groups = await FloorQuickTextGroup.find({ floor: floorId }).lean();
  const groupDocuments = groups.map((group) => ({
    floor: floorId,
    room: roomId,
    user: userId,
    order: group.order,
    title: group.title,
    lang: group.lang,
    translations: Array.isArray(group.translations) ? group.translations : [],
  }));
  const createdGroups = groupDocuments.length ? await RoomQuickTextGroup.create(groupDocuments) : [];
  const groupIds = new Map(
    groups
      .map((group, index) => [String(group._id), createdGroups[index]?._id])
      .filter(([, createdId]) => createdId)
  );

  const sourceGroupIds = groups.map((group) => group._id);
  const items = sourceGroupIds.length
    ? await FloorQuickTextItem.find({ floor: floorId, group: { $in: sourceGroupIds } }).lean()
    : [];
  const itemDocuments = items
    .map((item) => {
      const group = groupIds.get(String(item.group));
      if (!group) return null;
      return {
        floor: floorId,
        room: roomId,
        group,
        order: item.order,
        label: item.label,
        lang: item.lang,
        translations: Array.isArray(item.translations) ? item.translations : [],
      };
    })
    .filter(Boolean);
  if (itemDocuments.length) await RoomQuickTextItem.create(itemDocuments);
};

const provisionRoomResources = async ({
  floorId,
  roomId,
  userId,
  targetLangs,
  mediaRoot = process.env.MEDIA_PATH,
}) => {
  await cloneRoomTags({ floorId, roomId, userId, targetLangs });
  await cloneRoomQuickTexts({ floorId, roomId, userId });
  await fsPromises.mkdir(path.join(mediaRoot, String(floorId), String(roomId)), { recursive: true });
};

const rollbackRoomProvisioning = async ({ floorId, roomId, mediaRoot = process.env.MEDIA_PATH }) => {
  await Promise.allSettled([
    withAIAnalysisIntegrityLock(() =>
      Promise.allSettled([
        rollbackRoomSettingInheritance({ roomId }),
        RoomQuickTextItem.deleteMany({ room: roomId }),
        RoomQuickTextGroup.deleteMany({ room: roomId }),
        RoomTag.deleteMany({ room: roomId }),
        Room.findByIdAndDelete(roomId),
      ])
    ),
    fsPromises.rm(path.join(mediaRoot, String(floorId), String(roomId)), { recursive: true, force: true }),
  ]);
};

module.exports = {
  provisionRoomResources,
  rollbackRoomProvisioning,
};
