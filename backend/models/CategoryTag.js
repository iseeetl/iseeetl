const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate-v2');

const TranslationSchema = new mongoose.Schema(
  {
    lang: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const CategoryTagSchema = new mongoose.Schema({
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
    default: undefined,
  },
  translations: {
    type: [TranslationSchema],
    default: undefined,
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

CategoryTagSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('CategoryTag', CategoryTagSchema);
