const mongoose = require('mongoose');
const Paginate = require('mongoose-paginate-v2');

const GoogleTranslateAPISchema = new mongoose.Schema({
  use_month: {
    type: String,
    default: null,
  },
  count: {
    type: Number,
    default: 0,
  },
  length: {
    type: Number,
    default: 0,
  },
  used_at: {
    type: Date,
    default: null,
  },
});

GoogleTranslateAPISchema.plugin(Paginate);

module.exports = mongoose.model('GoogleTranslateAPI', GoogleTranslateAPISchema);
