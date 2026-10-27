const { Types } = require('mongoose');
const { actorKey } = require('./contract');
const id = value => String(value?._id || value || '');

// Call only after the existing mutation's authorization and concurrency checks.
// Append references with the content mutation, so a process crash cannot lose its event.
function eventFor({ chat, type, actor, item = chat, replyId = null, supplementId = null,
  media = null, reactionId = null, owner = item, action = 'added', at = new Date() }) {
  if (!chat?._id || !chat.room || !actor || !['post', 'reply', 'alternative', 'supplement', 'reaction'].includes(type)) {
    throw new TypeError('An authorized activity event requires chat, actor and type');
  }
  const eventId = new Types.ObjectId();
  return {
    _id: eventId, idempotency_key: id(eventId), room_id: chat.room, floor_id: chat.floor,
    root_post_id: chat._id, reply_id: replyId, supplement_id: supplementId,
    media, reaction_id: reactionId, type, action, actor_key: actor,
    owner_key: actorKey(owner), occurred_at: at,
    ai_kind: item.meta?.analysis_kind || null,
    ai_tag_id: item.meta?.analysis_trigger_tag || null,
  };
}
function appendEvents(update, events) {
  if (!events.length) return update;
  if (update.$push?.activity_outbox || update.$set?.activity_outbox) throw new TypeError('Duplicate activity outbox mutation');
  return { ...update, $push: { ...update.$push, activity_outbox: { $each: events } } };
}
module.exports = { eventFor, appendEvents };
