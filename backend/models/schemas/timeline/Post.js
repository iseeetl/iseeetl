const { Schema } = require('mongoose');

const ReactionSchema = require('./Reaction');
const ReplySchema = require('./Reply');
const SupplementSchema = require('./Supplement');
const TranslationSchema = require('./Translation');

const PostSchema = new Schema({
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
    default: null,
  },
  guest_id: {
    type: String,
    default: null,
  },
  guest_name: {
    type: String,
    default: null,
  },
  content: {
    type: String,
    default: null,
  },
  lang: {
    type: String,
    default: 'ja',
  },
  room_tags: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: 'RoomTag',
      },
    ],
    default: [],
  },
  animation: {
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
  supplementaries: {
    type: [SupplementSchema],
    default: [],
  },
  replies: {
    type: [ReplySchema],
    default: [],
  },
  reactions: {
    type: [ReactionSchema],
    default: [],
  },
  translations: {
    type: [TranslationSchema],
    default: [],
  },
  analysis_source_revision: {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger,
    default: undefined,
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

module.exports = PostSchema;
