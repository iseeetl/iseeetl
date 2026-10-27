const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  recipient_key: { type: String, required: true },
  root_post_id: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  next_at: { type: Date, required: true },
  notification_id: { type: Schema.Types.ObjectId, required: true },
}, { strict: 'throw' });
schema.index({ recipient_key: 1, root_post_id: 1, type: 1 }, { unique: true });
module.exports = mongoose.model('ActivityPushWindow', schema);
