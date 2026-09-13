const mongoose = require('mongoose');
const {
  ANALYSIS_KINDS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_SPEECH_PROMPT_BYTES,
} = require('../../constants/aiAnalysisSettings');

const { Schema } = mongoose;

const normalizePrompt = (value) =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

const promptIsValid = function (value) {
  if (typeof value !== 'string') return false;
  const bytes = Buffer.byteLength(value, 'utf8');
  return (
    [...value].length <= MAX_ADDITIONAL_PROMPT_CODE_POINTS &&
    bytes <= MAX_ADDITIONAL_PROMPT_BYTES &&
    (this.analysis_kind !== 'speech' || bytes <= MAX_SPEECH_PROMPT_BYTES)
  );
};

const buildCommonAIAnalysisSettingFields = () => ({
  analysis_kind: {
    type: String,
    enum: ANALYSIS_KINDS,
    required: true,
  },
  additional_prompt: {
    type: String,
    default: '',
    set: normalizePrompt,
    validate: promptIsValid,
  },
  result_user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  revision: {
    type: Number,
    min: 1,
    validate: Number.isSafeInteger,
    required: true,
    default: 1,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updated_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  delete_flg: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: null,
  },
});

const addLineagePairValidation = (schema, settingField, revisionField) => {
  schema.pre('validate', function (next) {
    const hasSetting = this[settingField] !== null && this[settingField] !== undefined;
    const hasRevision = this[revisionField] !== null && this[revisionField] !== undefined;
    if (hasSetting !== hasRevision || (hasRevision && !Number.isSafeInteger(this[revisionField]))) {
      this.invalidate(revisionField, 'lineage setting and revision must be present together');
    }
    next();
  });
};

module.exports = {
  addLineagePairValidation,
  buildCommonAIAnalysisSettingFields,
};
