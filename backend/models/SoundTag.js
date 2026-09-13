const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate-v2');

const SoundTagSchema = new mongoose.Schema({
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
  tags: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: 'RoomTag',
      },
    ],
    default: [],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: null,
  },
});
SoundTagSchema.index({ floor: 1, room: 1, user: 1 }, { unique: true });
SoundTagSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('SoundTag', SoundTagSchema);
