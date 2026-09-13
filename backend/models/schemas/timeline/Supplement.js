const { Schema } = require('mongoose');

const ReactionSchema = require('./Reaction');
const TranslationSchema = require('./Translation');

const AIAnalysisMetaSchema = new Schema(
  {
    analysis_kind: {
      type: String,
      enum: ['vision', 'speech', 'video', 'audioScene', 'conversation'],
      required: false,
      default: undefined,
    },
    analysis_setting: {
      type: Schema.Types.ObjectId,
      ref: 'RoomAIAnalysisSetting',
      required: false,
      default: undefined,
    },
    analysis_setting_revision: {
      type: Number,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
      required: false,
      default: undefined,
    },
    analysis_trigger_tag: {
      type: Schema.Types.ObjectId,
      ref: 'RoomTag',
      required: false,
      default: undefined,
    },
    analysis_source_revision: {
      type: Number,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
      required: false,
      default: undefined,
    },
  },
  { _id: false }
);

function validateCompleteAnalysisMeta() {
  const lineageFields = [
    this.analysis_setting,
    this.analysis_setting_revision,
    this.analysis_trigger_tag,
    this.analysis_source_revision,
  ];
  const definedCount = lineageFields.filter((value) => value !== undefined && value !== null).length;
  return (
    definedCount === 0 ||
    (definedCount === lineageFields.length && this.analysis_kind !== undefined && this.analysis_kind !== null)
  );
}

[
  'analysis_setting',
  'analysis_setting_revision',
  'analysis_trigger_tag',
  'analysis_source_revision',
].forEach((field) => {
  AIAnalysisMetaSchema.path(field).validate(
    validateCompleteAnalysisMeta,
    'AI analysis meta lineage must be entirely unset or entirely set'
  );
});

const SupplementSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  meta: {
    type: AIAnalysisMetaSchema,
    required: false,
    default: undefined,
  },
  content: {
    type: String,
    default: null,
  },
  lang: {
    type: String,
    default: null,
  },
  image_name: {
    type: String,
    default: null,
  },
  image_thumbnail_name: {
    type: String,
    default: null,
  },
  image_caption: {
    type: String,
    default: null,
  },
  video_name: {
    type: String,
    default: null,
  },
  video_thumbnail_name: {
    type: String,
    default: null,
  },
  video_subtitle_originalname: {
    type: String,
    default: null,
  },
  video_subtitle_name: {
    type: String,
    default: null,
  },
  audio_name: {
    type: String,
    default: null,
  },
  audio_title: {
    type: String,
    default: null,
  },
  audio_description: {
    type: String,
    default: null,
  },
  reactions: {
    type: [ReactionSchema],
    default: [],
  },
  translations: {
    type: [TranslationSchema],
    default: [],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: null,
  },
  deleted_at: {
    type: Date,
    default: null,
  },
  delete_flg: {
    type: Boolean,
    default: false,
  },
});

module.exports = SupplementSchema;
