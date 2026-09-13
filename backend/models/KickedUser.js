const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const KickedUserSchema = new mongoose.Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  kicked_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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
  kicked_at: {
    type: Date,
    default: Date.now,
  },
});

KickedUserSchema.set('autoIndex', true);
KickedUserSchema.index({ floor: 1, user: 1 }, { name: 'uniq_kickedusers_floor_user', unique: true });

KickedUserSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('KickedUser', KickedUserSchema);
