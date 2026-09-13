const mongoose = require('mongoose');
const { Schema } = mongoose;
const TranslationSchema = require('./schemas/Translation');

const RoomQuickTextGroupSchema = new Schema(
  {
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

module.exports = mongoose.model('RoomQuickTextGroup', RoomQuickTextGroupSchema);
