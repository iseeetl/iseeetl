const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const {
  addLineagePairValidation,
  buildCommonAIAnalysisSettingFields,
} = require('./_shared/aiAnalysisSettingFields');
const { REQUIRED_INDEXES } = require('../constants/aiAnalysisSettings');

const { Schema } = mongoose;

const FloorAIAnalysisSettingSchema = new Schema({
  floor: {
    type: Schema.Types.ObjectId,
    ref: 'Floor',
    required: true,
  },
  floor_tag: {
    type: Schema.Types.ObjectId,
    ref: 'FloorTag',
    required: true,
  },
  source_master_setting: {
    type: Schema.Types.ObjectId,
    ref: 'AIAnalysisSetting',
    default: null,
  },
  source_master_revision: {
    type: Number,
    min: 1,
    default: null,
  },
  ...buildCommonAIAnalysisSettingFields(),
});

addLineagePairValidation(
  FloorAIAnalysisSettingSchema,
  'source_master_setting',
  'source_master_revision'
);
const requiredIndex = REQUIRED_INDEXES.find(
  ({ modelName }) => modelName === 'FloorAIAnalysisSetting'
);
FloorAIAnalysisSettingSchema.index(requiredIndex.key, {
  name: requiredIndex.name,
  unique: requiredIndex.unique,
  partialFilterExpression: requiredIndex.partialFilterExpression,
});
FloorAIAnalysisSettingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FloorAIAnalysisSetting', FloorAIAnalysisSettingSchema);
