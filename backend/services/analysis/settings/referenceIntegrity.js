const AppError = require('../../../utils/appError');
const mongoose = require('mongoose');
const {
  ACTIVE_AI_ANALYSIS_REFERENCE_REASON,
} = require('../../../constants/aiAnalysisSettings');
const { withKeyedLocks } = require('../../../utils/keyedLock');

const referenceKey = (type, id) => `ai-reference:${type}:${String(id)}`;
const parentKey = (type, tagId, analysisKind) =>
  `ai-parent:${type}:${String(tagId)}:${analysisKind}`;
const scopeKey = (type, id = 'global') => `ai-scope:${type}:${String(id)}`;
const INTEGRITY_LOCK_KEY = 'ai-analysis-reference-integrity';
const TAG_REFERENCE_TYPES = new Set(['category-tag', 'floor-tag', 'room-tag']);

const withAIAnalysisIntegrityLock = (task) => withKeyedLocks([INTEGRITY_LOCK_KEY], task);

const assertRoomTagParentActive = async (tag) => {
  const Floor = require('../../../models/Floor');
  const Room = require('../../../models/Room');
  const [floor, room] = tag.floor && tag.room
    ? await Promise.all([
        Floor.findOne({ _id: tag.floor, delete_flg: false }).lean(),
        Room.findOne({ _id: tag.room, floor: tag.floor, delete_flg: false }).lean(),
      ])
    : [null, null];
  if (!floor || !room) throw new AppError({ code: 'CONFLICT' });
};

const withReferenceLocks = (references, task) =>
  withKeyedLocks(
    references.map(({ type, id }) => referenceKey(type, id)),
    task
  );

const hasDocuments = async (Model, filter) => (await Model.countDocuments(filter)) > 0;

// フロア・ルームの論理削除では、配下のAI解析設定を残す。
// ここでは直接参照される結果ユーザと、設定と同じ階層のタグだけを確認する。
const assertNoActiveAIAnalysisReferences = async (type, id) => {
  if (!mongoose.isValidObjectId(id)) return;
  const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
  const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
  const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');

  const active = { delete_flg: false };
  let referenced = false;
  if (type === 'user') {
    referenced =
      (await hasDocuments(AIAnalysisSetting, { ...active, result_user: id })) ||
      (await hasDocuments(FloorAIAnalysisSetting, { ...active, result_user: id })) ||
      (await hasDocuments(RoomAIAnalysisSetting, { ...active, result_user: id }));
  } else if (type === 'category-tag') {
    referenced = await hasDocuments(AIAnalysisSetting, { ...active, category_tag: id });
  } else if (type === 'floor-tag') {
    referenced = await hasDocuments(FloorAIAnalysisSetting, { ...active, floor_tag: id });
  } else if (type === 'room-tag') {
    referenced = await hasDocuments(RoomAIAnalysisSetting, { ...active, room_tag: id });
  }
  if (referenced) {
    const details = TAG_REFERENCE_TYPES.has(type)
      ? {
          reason: ACTIVE_AI_ANALYSIS_REFERENCE_REASON,
          resource_type: type,
        }
      : undefined;
    throw new AppError({ code: 'CONFLICT', details });
  }
};

module.exports = {
  assertNoActiveAIAnalysisReferences,
  assertRoomTagParentActive,
  parentKey,
  referenceKey,
  scopeKey,
  withAIAnalysisIntegrityLock,
  withReferenceLocks,
};
