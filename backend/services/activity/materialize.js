const Chat = require('../../models/Chat');
const Event = require('../../models/ActivityEvent');
const Notification = require('../../models/ActivityNotification');
const Preference = require('../../models/ActivityPreference');
const Read = require('../../models/ActivityRead');
const Subscription = require('../../models/ActivitySubscription');
const User = require('../../models/User');
const PushFilter = require('../../models/PushFilter');
const { filterAuthorizedRoomUserIds } = require('../room/roomAccess.service');
const { ensureGuestRoomContext } = require('../timeline/shared/guestAccess');
const matchConditions = require('../timeline/shared/matchConditions');
const { normalize, eventVisible } = require('./preferences');
const { planNotification, threadAuthors, involved } = require('./contract');
const { targetFor, id } = require('./access');
const epoch = new Date(0);
const { contextMatches } = require('./filterContext');

async function materialize(event) {
  const chat = await Chat.findOne({ _id: event.root_post_id, room: event.room_id, delete_flg: false }).lean();
  const target = targetFor(chat, event);
  if (!target) return;
  const subscriptions = await Subscription.find({ room_id: event.room_id, root_post_id: event.root_post_id, created_at: { $lte: event.occurred_at } }).lean();
  const filters = ['post', 'reply', 'supplement'].includes(event.type)
    ? await PushFilter.find({ room: event.room_id }).populate('user', '_id username push_enabled').lean() : [];
  const actorId = event.actor_key.startsWith('user:') ? event.actor_key.slice(5) : null;
  const actor = actorId ? await User.findById(actorId).select('username').lean() : null;
  const filterRecipients = new Set(filters.filter(filter => filter._id.getTimestamp() <= new Date(event.occurred_at) && filter.user?.push_enabled && matchConditions({
    room_tags: (target.room_tags || []).map(id), content: target.content || '', username: actor?.username || target.guest_name || '', animation: target.animation,
  }, filter.conditions)).map(filter => `user:${id(filter.user)}`));
  const saved = await Preference.find({ room_id: event.room_id }).lean();
  const authors = threadAuthors(chat, event);
  const candidates = new Set([event.owner_key, ...authors, ...subscriptions.map(row => row.recipient_key), ...filterRecipients,
    ...saved.map(row => row.recipient_key)].filter(Boolean));
  const userIds = [...candidates].filter(key => key.startsWith('user:')).map(key => key.slice(5));
  const authorized = new Set((await filterAuthorizedRoomUserIds(userIds, event.room_id)).map(value => `user:${value}`));
  let guestsAllowed = false;
  try { await ensureGuestRoomContext(id(event.room_id)); guestsAllowed = true; } catch { /* Membership may have changed after the mutation. */ }
  const users = await User.find({ _id: { $in: userIds }, delete_flg: false }).select('_id push_enabled reply_push_enabled replied_post_push_enabled').lean();
  const userMap = new Map(users.map(user => [`user:${id(user)}`, user]));
  const settings = new Map(saved.map(row => [row.recipient_key, row.value]));
  const matchedContexts = new Map();
  for (const key of candidates) {
    if (event.actor_key === key || !(authorized.has(key) || guestsAllowed && key.startsWith('guest:'))) continue;
    const user = userMap.get(key);
    const stored = settings.get(key);
    const prefs = normalize(stored, { legacyUser: user || {}, now: epoch });
    let contextMatched = false;
    if (stored) {
      const contextKey = JSON.stringify(prefs.context);
      if (!matchedContexts.has(contextKey)) matchedContexts.set(contextKey, await contextMatches(event, prefs.context));
      contextMatched = matchedContexts.get(contextKey);
    }
    const plan = planNotification({ event, recipientKey: key, preferences: prefs, chat,
      roomConfigured: !!stored, authoredThread: authors.has(key), related: involved(chat, key, event), contextMatched,
      subscribed: subscriptions.some(row => row.recipient_key === key), filterMatched: filterRecipients.has(key), visible: eventVisible(event, prefs) });
    if (!plan) continue;
    const read = await Read.findOne({ recipient_key: key, event_id: event._id }).lean();
    const entry = { read_at: read?.read_at || null, recipient_key: key, event_id: event._id, room_id: event.room_id,
      reasons: plan.reasons, suppressed: plan.suppressed, created_at: event.occurred_at,
      push_key: require('node:crypto').randomUUID(),
      push_state: !read && plan.pushEligible && user?.push_enabled ? 'pending' : 'none',
    };
    await Notification.updateOne({ recipient_key: key, event_id: event._id }, { $setOnInsert: entry }, { upsert: true, runValidators: true });
  }
}
async function drainOnce({ limit = 25 } = {}) {
  const chats = await Chat.find({ 'activity_outbox.0': { $exists: true } }).select('+activity_outbox').limit(limit).lean();
  let processed = 0;
  for (const chat of chats) for (const item of chat.activity_outbox || []) {
    await Event.updateOne({ _id: item._id }, { $setOnInsert: item }, { upsert: true, runValidators: true });
    const saved = await Event.findById(item._id).lean();
    if (!saved.materialized_at) {
      await materialize(saved);
      await Event.updateOne({ _id: saved._id, materialized_at: null }, { $set: { materialized_at: new Date() } });
    }
    // Remove only the completed event; concurrent writes are retained.
    await Chat.updateOne({ _id: chat._id }, { $pull: { activity_outbox: { _id: item._id } } });
    processed++;
  }
  return { processed };
}
module.exports = { materialize, drainOnce };
