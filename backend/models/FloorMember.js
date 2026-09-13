const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const FloorMemberSchema = new mongoose.Schema({
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
  created_at: {
    type: Date,
    default: Date.now,
  },
}, { autoIndex: true });

FloorMemberSchema.index({ floor: 1, user: 1 }, { name: 'uniq_floormembers_floor_user', unique: true });

FloorMemberSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('FloorMember', FloorMemberSchema);
