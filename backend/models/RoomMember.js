const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const RoomMemberSchema = new mongoose.Schema({
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
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
}, { autoIndex: true });

RoomMemberSchema.index({ room: 1, user: 1 }, { name: 'uniq_roommembers_room_user', unique: true });

RoomMemberSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('RoomMember', RoomMemberSchema);
