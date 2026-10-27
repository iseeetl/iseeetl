const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  recipient_key: { type: String, required: true },
  room_id: { type: Schema.Types.ObjectId, required: true },
  version: { type: Number, required: true, min: 1, default: 1 },
  value: { type: Schema.Types.Mixed, required: true },
  created_at: { type: Date, required: true },
  updated_at: { type: Date, required: true },
}, { strict: 'throw' });
schema.index({ recipient_key: 1, room_id: 1 }, { unique: true });
module.exports = mongoose.model('ActivityPreference', schema);
