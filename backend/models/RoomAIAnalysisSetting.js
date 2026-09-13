const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const {
  addLineagePairValidation,
  buildCommonAIAnalysisSettingFields,
} = require('./_shared/aiAnalysisSettingFields');
const { REQUIRED_INDEXES } = require('../constants/aiAnalysisSettings');

const { Schema } = mongoose;

const RoomAIAnalysisSettingSchema = new Schema({
  floor: {
    type: Schema.Types.ObjectId,
    ref: 'Floor',
    required: true,
  },
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
  },
  room_tag: {
    type: Schema.Types.ObjectId,
    ref: 'RoomTag',
    required: true,
  },
  source_floor_setting: {
    type: Schema.Types.ObjectId,
    ref: 'FloorAIAnalysisSetting',
    default: null,
  },
  source_floor_revision: {
    type: Number,
    min: 1,
    default: null,
  },
  ...buildCommonAIAnalysisSettingFields(),
});

addLineagePairValidation(
  RoomAIAnalysisSettingSchema,
  'source_floor_setting',
  'source_floor_revision'
);
const requiredIndex = REQUIRED_INDEXES.find(
  ({ modelName }) => modelName === 'RoomAIAnalysisSetting'
);
RoomAIAnalysisSettingSchema.index(requiredIndex.key, {
  name: requiredIndex.name,
  unique: requiredIndex.unique,
  partialFilterExpression: requiredIndex.partialFilterExpression,
});
RoomAIAnalysisSettingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('RoomAIAnalysisSetting', RoomAIAnalysisSettingSchema);
