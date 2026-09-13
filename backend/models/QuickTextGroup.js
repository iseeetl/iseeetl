const mongoose = require('mongoose');
const { Schema } = mongoose;

const QuickTextGroupSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    title: {
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

module.exports = mongoose.model('QuickTextGroup', QuickTextGroupSchema);
