const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  recipient_key: { type: String, required: true },
  event_id: { type: Schema.Types.ObjectId, ref: 'ActivityEvent', required: true },
  room_id: { type: Schema.Types.ObjectId, required: true },
  reasons: [{ type: String, enum: ['roomActivity', 'relatedActivity', 'ownUpdates', 'ownReactions', 'subscribedThreads', 'savedFilter', 'legacyReplyParticipants', 'legacyOwnSupplement'] }],
  push_state: { type: String, enum: ['none', 'pending', 'sending', 'sent', 'suppressed', 'failed'], default: 'none' },
  push_key: { type: String, default: null },
  push_attempts: { type: Number, default: 0 },
  push_attempted_at: { type: Date, default: null },
  suppressed: { type: Boolean, default: false },
  read_at: { type: Date, default: null },
  created_at: { type: Date, required: true },
}, { strict: 'throw' });
schema.index({ recipient_key: 1, event_id: 1 }, { unique: true });
schema.index({ recipient_key: 1, room_id: 1, created_at: -1, _id: -1 });
// No TTL until retention and deletion policies are agreed for production.
module.exports = mongoose.model('ActivityNotification', schema);
