const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const FloorInviteSchema = new mongoose.Schema({
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
  token: {
    type: String,
    unique: true,
    required: true,
    trim: true,
  },
  token_expiry: {
    type: Date,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

FloorInviteSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FloorInvite', FloorInviteSchema);
