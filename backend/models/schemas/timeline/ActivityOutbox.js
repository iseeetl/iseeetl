const { Schema } = require('mongoose');
const schema = new Schema({
  idempotency_key: { type: String, required: true },
  room_id: { type: Schema.Types.ObjectId, required: true },
  floor_id: { type: Schema.Types.ObjectId, required: true },
  root_post_id: { type: Schema.Types.ObjectId, required: true },
  reply_id: { type: Schema.Types.ObjectId, default: null },
  supplement_id: { type: Schema.Types.ObjectId, default: null },
  reaction_id: { type: Schema.Types.ObjectId, default: null },
  media: { type: String, enum: ['image', 'video', 'audio', null], default: null },
  type: { type: String, enum: ['post', 'reply', 'alternative', 'supplement', 'reaction'], required: true },
  action: { type: String, enum: ['added', 'edited'], required: true },
  actor_key: { type: String, required: true },
  owner_key: { type: String, default: null },
  ai_kind: { type: String, default: null },
  ai_tag_id: { type: Schema.Types.ObjectId, default: null },
  occurred_at: { type: Date, required: true },
}, { strict: 'throw' });
module.exports = schema;
