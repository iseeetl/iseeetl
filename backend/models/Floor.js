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
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5000,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5000,
    },
    lang: {
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

const FloorSchema = new mongoose.Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  },
  description: {
    type: String,
    default: null,
    trim: true,
    maxlength: 200,
  },
  lang: {
    type: String,
    default: null,
    trim: true,
  },
  target_langs: {
    type: [String],
    default: [],
  },
  translations: {
    type: [TranslationSchema],
    default: [],
  },
  image_name: {
    type: String,
    default: null,
    trim: true,
  },
  floor_display_hidden: {
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

FloorSchema.set('runValidators', true);
FloorSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Floor', FloorSchema);
