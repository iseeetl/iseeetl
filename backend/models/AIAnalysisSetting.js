const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const {
  buildCommonAIAnalysisSettingFields,
} = require('./_shared/aiAnalysisSettingFields');
const { REQUIRED_INDEXES } = require('../constants/aiAnalysisSettings');

const { Schema } = mongoose;

const AIAnalysisSettingSchema = new Schema({
  category_tag: {
    type: Schema.Types.ObjectId,
    ref: 'CategoryTag',
    required: true,
  },
  ...buildCommonAIAnalysisSettingFields(),
});

const requiredIndex = REQUIRED_INDEXES.find(({ modelName }) => modelName === 'AIAnalysisSetting');
AIAnalysisSettingSchema.index(requiredIndex.key, {
  name: requiredIndex.name,
  unique: requiredIndex.unique,
  partialFilterExpression: requiredIndex.partialFilterExpression,
});
AIAnalysisSettingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('AIAnalysisSetting', AIAnalysisSettingSchema);
