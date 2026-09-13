const ANALYSIS_KINDS = Object.freeze([
  'vision',
  'audioScene',
  'speech',
  'video',
  'conversation',
]);

const MAX_ACTIVE_SETTINGS_PER_SCOPE = 100;
const MAX_ADDITIONAL_PROMPT_CODE_POINTS = 2000;
const MAX_ADDITIONAL_PROMPT_BYTES = 8000;
const MAX_SPEECH_PROMPT_BYTES = 224;
const ACTIVE_AI_ANALYSIS_REFERENCE_REASON = 'ACTIVE_AI_ANALYSIS_REFERENCE';

const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    modelName: 'AIAnalysisSetting',
    collectionName: 'aianalysissettings',
    name: 'active_category_tag_analysis_kind_unique',
    key: Object.freeze({ category_tag: 1, analysis_kind: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ delete_flg: false }),
  }),
  Object.freeze({
    modelName: 'FloorAIAnalysisSetting',
    collectionName: 'flooraianalysissettings',
    name: 'active_floor_tag_analysis_kind_unique',
    key: Object.freeze({ floor: 1, floor_tag: 1, analysis_kind: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ delete_flg: false }),
  }),
  Object.freeze({
    modelName: 'RoomAIAnalysisSetting',
    collectionName: 'roomaianalysissettings',
    name: 'active_room_tag_analysis_kind_unique',
    key: Object.freeze({ floor: 1, room: 1, room_tag: 1, analysis_kind: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ delete_flg: false }),
  }),
]);

module.exports = {
  ACTIVE_AI_ANALYSIS_REFERENCE_REASON,
  ANALYSIS_KINDS,
  MAX_ACTIVE_SETTINGS_PER_SCOPE,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_SPEECH_PROMPT_BYTES,
  REQUIRED_INDEXES,
};
