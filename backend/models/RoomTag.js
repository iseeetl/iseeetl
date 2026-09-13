const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate-v2');

const TranslationSchema = mongoose.Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lang: {
      type: String,
      required: true,
    },
    name: {
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

const RoomTagSchema = new mongoose.Schema({
  source_floor_tag: {
    type: Schema.Types.ObjectId,
    ref: 'FloorTag',
    default: null,
  },
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
  name: {
    type: String,
    required: true,
  },
  lang: {
    type: String,
    default: null,
  },
  translations: {
    type: [TranslationSchema],
    default: [],
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
  deleted_at: {
    type: Date,
    default: null,
  },
});
RoomTagSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('RoomTag', RoomTagSchema);
