const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

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
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema({
  floor: {
    type: Schema.Types.ObjectId,
    ref: 'Floor',
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  display_order: {
    type: Number,
    default: 0,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: null,
  },
  lang: {
    type: String,
    default: null,
  },
  translations: {
    type: [TranslationSchema],
    default: [],
  },
  image_name: {
    type: String,
    default: null,
  },
  guest_reaction_only: {
    type: Boolean,
    default: false,
  },
  member_only: {
    type: Boolean,
    default: false,
  },
  room_display_hidden: {
    type: Boolean,
    default: false,
  },
  notification: {
    type: Boolean,
    default: true,
  },
  external_sns_button: {
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
  delete_flg: {
    type: Boolean,
    default: false,
  },
});

RoomSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Room', RoomSchema);
