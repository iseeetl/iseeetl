const { Schema } = require('mongoose');

const TranslationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    guest_id: {
      type: String,
      default: null,
    },
    lang: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

module.exports = TranslationSchema;
