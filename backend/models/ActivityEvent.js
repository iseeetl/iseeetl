const mongoose = require('mongoose');
const schema = require('./schemas/timeline/ActivityOutbox').clone();
schema.add({ materialized_at: { type: Date, default: null } });
schema.index({ idempotency_key: 1 }, { unique: true });
schema.index({ room_id: 1, occurred_at: -1, _id: -1 });
schema.index({ root_post_id: 1, occurred_at: -1 });
module.exports = mongoose.model('ActivityEvent', schema);
