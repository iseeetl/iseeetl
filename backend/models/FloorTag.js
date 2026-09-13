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
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const FloorTagSchema = new mongoose.Schema({
  source_category_tag: {
    type: Schema.Types.ObjectId,
    ref: 'CategoryTag',
    default: null,
  },
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
  order: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  lang: {
    type: String,
    required: true,
    trim: true,
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
FloorTagSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FloorTag', FloorTagSchema);
