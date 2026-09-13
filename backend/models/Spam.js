const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate-v2');

const SpamSchema = new mongoose.Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  word: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});
SpamSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Spam', SpamSchema);
