const mongoose = require('mongoose');
const { Schema } = mongoose;
// Explicitly opened/marked room events, independent from personal-delivery settings.
const schema = new Schema({
  recipient_key: { type: String, required: true },
  room_id: { type: Schema.Types.ObjectId, required: true },
  event_id: { type: Schema.Types.ObjectId, required: true },
  read_at: { type: Date, required: true },
}, { strict: 'throw' });
schema.index({ recipient_key: 1, event_id: 1 }, { unique: true });
schema.index({ recipient_key: 1, room_id: 1 });
module.exports = mongoose.model('ActivityRead', schema);
