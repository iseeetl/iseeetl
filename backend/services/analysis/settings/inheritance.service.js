const AppError = require('../../../utils/appError');
const { MAX_ACTIVE_SETTINGS_PER_SCOPE } = require('../../../constants/aiAnalysisSettings');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const CategoryTag = require('../../../models/CategoryTag');
const FloorTag = require('../../../models/FloorTag');

const normalizeId = (value) => String(value?._id || value);

const queryLean = (query) => query.lean();

const assertAllParentsActive = async ({
  ParentModel,
  childTags,
  sourceTagField,
  scope = {},
}) => {
  if (!childTags.length) return;
  const parentIds = childTags.map((tag) => tag[sourceTagField]);
  const parents = await queryLean(
    ParentModel.find({
      ...scope,
      _id: { $in: parentIds },
      delete_flg: false,
    })
  );
  const activeParents = new Map(
    parents.map((parent) => [normalizeId(parent), parent])
  );
  if (
    childTags.some((child) => {
      const parent = activeParents.get(normalizeId(child[sourceTagField]));
      return !parent || parent.name !== child.name;
    })
  ) {
    throw new AppError({ code: 'CONFLICT' });
  }
};

const assertCapacity = async ({ ChildSettingModel, scope, additions }) => {
  if (!additions) return;
  const activeCount = await ChildSettingModel.countDocuments({
    ...scope,
    delete_flg: false,
  });
  if (activeCount + additions > MAX_ACTIVE_SETTINGS_PER_SCOPE) {
    throw new AppError({ code: 'CONFLICT' });
  }
};

const buildSettingDocuments = ({
  childTags,
  parentSettings,
  childParentTagField,
  parentSettingTagField,
  childTagField,
  scope,
  lineageSettingField,
  lineageRevisionField,
  userId,
}) => {
  const childByParent = new Map(
    childTags.map((tag) => [normalizeId(tag[childParentTagField]), tag])
  );
  return parentSettings.map((parent) => {
    const childTag = childByParent.get(normalizeId(parent[parentSettingTagField]));
    return {
      ...scope,
      [childTagField]: childTag._id,
      analysis_kind: parent.analysis_kind,
      additional_prompt: parent.additional_prompt,
      result_user: parent.result_user,
      [lineageSettingField]: parent._id,
      [lineageRevisionField]: parent.revision,
      revision: 1,
      user: userId,
      updated_by: userId,
    };
  });
};

const prepareFloorSettingInheritance = async ({ floorId, childTags, userId }) => {
  const linkedTags = childTags.filter((tag) => tag.source_category_tag);
  const parentIds = linkedTags.map((tag) => tag.source_category_tag);
  await assertAllParentsActive({
    ParentModel: CategoryTag,
    childTags: linkedTags,
    sourceTagField: 'source_category_tag',
  });

  if (!linkedTags.length) {
    return { type: 'floor', childTagIds: linkedTags.map((tag) => tag._id), documents: [] };
  }

  const parentSettings = await queryLean(
    AIAnalysisSetting.find({
      category_tag: { $in: parentIds },
      delete_flg: false,
    })
  );
  await assertCapacity({
    ChildSettingModel: FloorAIAnalysisSetting,
    scope: { floor: floorId },
    additions: parentSettings.length,
  });
  return {
    type: 'floor',
    childTagIds: linkedTags.map((tag) => tag._id),
    documents: buildSettingDocuments({
      childTags: linkedTags,
      parentSettings,
      childParentTagField: 'source_category_tag',
      parentSettingTagField: 'category_tag',
      childTagField: 'floor_tag',
      scope: { floor: floorId },
      lineageSettingField: 'source_master_setting',
      lineageRevisionField: 'source_master_revision',
      userId,
    }),
  };
};

const prepareRoomSettingInheritance = async ({ floorId, roomId, childTags, userId }) => {
  const linkedTags = childTags.filter((tag) => tag.source_floor_tag);
  const parentIds = linkedTags.map((tag) => tag.source_floor_tag);
  await assertAllParentsActive({
    ParentModel: FloorTag,
    childTags: linkedTags,
    sourceTagField: 'source_floor_tag',
    scope: { floor: floorId },
  });

  if (!linkedTags.length) {
    return { type: 'room', childTagIds: linkedTags.map((tag) => tag._id), documents: [] };
  }

  const parentSettings = await queryLean(
    FloorAIAnalysisSetting.find({
      floor: floorId,
      floor_tag: { $in: parentIds },
      delete_flg: false,
    })
  );
  await assertCapacity({
    ChildSettingModel: RoomAIAnalysisSetting,
    scope: { room: roomId },
    additions: parentSettings.length,
  });
  return {
    type: 'room',
    childTagIds: linkedTags.map((tag) => tag._id),
    documents: buildSettingDocuments({
      childTags: linkedTags,
      parentSettings,
      childParentTagField: 'source_floor_tag',
      parentSettingTagField: 'floor_tag',
      childTagField: 'room_tag',
      scope: { floor: floorId, room: roomId },
      lineageSettingField: 'source_floor_setting',
      lineageRevisionField: 'source_floor_revision',
      userId,
    }),
  };
};

const commitSettingInheritance = async (plan) => {
  if (!plan?.documents?.length) return [];
  const Model = plan.type === 'floor' ? FloorAIAnalysisSetting : RoomAIAnalysisSetting;
  return Model.create(plan.documents);
};

const rollbackSettingInheritance = async (plan) => {
  if (!plan?.documents?.length || !plan.childTagIds.length) return;
  const Model = plan.type === 'floor' ? FloorAIAnalysisSetting : RoomAIAnalysisSetting;
  const tagField = plan.type === 'floor' ? 'floor_tag' : 'room_tag';
  await Model.deleteMany({ [tagField]: { $in: plan.childTagIds } });
};

const collectionExists = (Model) =>
  Model.db.db
    .listCollections({ name: Model.collection.collectionName }, { nameOnly: true })
    .hasNext();

const rollbackFloorSettingInheritance = async ({ floorId }) => {
  if (!(await collectionExists(FloorAIAnalysisSetting))) return;
  await FloorAIAnalysisSetting.deleteMany({ floor: floorId });
};

const rollbackRoomSettingInheritance = async ({ roomId }) => {
  if (!(await collectionExists(RoomAIAnalysisSetting))) return;
  await RoomAIAnalysisSetting.deleteMany({ room: roomId });
};

module.exports = {
  commitSettingInheritance,
  prepareFloorSettingInheritance,
  prepareRoomSettingInheritance,
  rollbackFloorSettingInheritance,
  rollbackRoomSettingInheritance,
  rollbackSettingInheritance,
};
