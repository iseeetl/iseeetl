const mongoose = require('mongoose');
const { Schema } = mongoose;

const QuickTextItemSchema = new Schema(
  {
    group: {
      type: Schema.Types.ObjectId,
      ref: 'QuickTextGroup',
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
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model('QuickTextItem', QuickTextItemSchema);
