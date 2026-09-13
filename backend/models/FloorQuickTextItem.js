const mongoose = require('mongoose');
const { Schema } = mongoose;
const TranslationSchema = require('./schemas/Translation');

const FloorQuickTextItemSchema = new Schema(
  {
    floor: {
      type: Schema.Types.ObjectId,
      ref: 'Floor',
      required: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: 'FloorQuickTextGroup',
      required: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },

    lang: {
      type: String,
      required: true,
    },
    translations: {
      type: [TranslationSchema],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model('FloorQuickTextItem', FloorQuickTextItemSchema);
