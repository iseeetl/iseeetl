const { Schema } = require('mongoose');

// 埋め込みの翻訳データには個別の_idを持たせない。
const TranslationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lang: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false, versionKey: false }
);

module.exports = TranslationSchema;
