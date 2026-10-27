const https = require('node:https');
const Notification = require('../../models/ActivityNotification');
const Event = require('../../models/ActivityEvent');
const Chat = require('../../models/Chat');
const User = require('../../models/User');
const Preference = require('../../models/ActivityPreference');
const Subscription = require('../../models/ActivitySubscription');
const PushFilter = require('../../models/PushFilter');
const Window = require('../../models/ActivityPushWindow');
const { isOneSignalEnabled, getOneSignalConfig } = require('../../config/featureFlags');
const { getApplicationConfig } = require('../../config/application');
const { buildOneSignalExternalId } = require('../../integrations/onesignal/identity');
const { filterAuthorizedRoomUserIds } = require('../room/roomAccess.service');
const matchConditions = require('../timeline/shared/matchConditions');
const { normalize, eventVisible, channelEnabled, scopeAllows, PUBLIC_CATEGORIES } = require('./preferences');
const { ownPushAllowed } = require('./contract');
const { contextMatches } = require('./filterContext');
const { id, targetFor } = require('./access');

// This path awaits the provider result. Unknown outcomes reuse the persisted UUID.
function sendConfirmed(payload, config = getOneSignalConfig()) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: config.host, port: config.port, path: config.path, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Basic ${config.restApiKey}` } }, res => {
      let size = 0, body = '';
      res.on('data', chunk => { size += chunk.length; if (size <= 32768) body += chunk; });
      res.on('end', () => {
        let value; try { value = JSON.parse(body); } catch { value = null; }
        if (res.statusCode >= 200 && res.statusCode < 300 && value?.id) resolve({ accepted: true });
        else reject(Object.assign(new Error('PUSH_PROVIDER_REJECTED'), { retryable: res.statusCode === 429 || res.statusCode >= 500 }));
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('PUSH_PROVIDER_TIMEOUT')));
    req.on('error', () => reject(Object.assign(new Error('PUSH_PROVIDER_UNCERTAIN'), { retryable: true })));
    req.end(JSON.stringify(payload));
  });
}
async function eligible(notification, event, user) {
  if (!user?.push_enabled || notification.read_at || !event) return false;
  if (!(await filterAuthorizedRoomUserIds([id(user)], event.room_id)).length) return false;
  const chat = await Chat.findOne({ _id: event.root_post_id, room: event.room_id, delete_flg: false }).lean();
  const target = targetFor(chat, event); if (!target) return false;
  const saved = await Preference.findOne({ recipient_key: notification.recipient_key, room_id: event.room_id }).lean();
  const prefs = normalize(saved?.value, { legacyUser: user, now: new Date(0) });
  if (!eventVisible(event, prefs)) return false;
  for (const reason of notification.reasons) {
    if (reason === 'savedFilter') {
      const filters = await PushFilter.find({ room: event.room_id, user: user._id }).lean();
      const actor = event.actor_key.startsWith('user:') ? await User.findById(event.actor_key.slice(5)).select('username').lean() : null;
      if (filters.some(filter => matchConditions({ content: target.content || '', room_tags: (target.room_tags || []).map(id), username: actor?.username || target.guest_name || '', animation: target.animation }, filter.conditions))) return true;
    } else if (reason === 'legacyOwnSupplement' || reason === 'legacyReplyParticipants') {
      if (ownPushAllowed(event, notification.recipient_key, prefs, chat)) return true;
    } else if (PUBLIC_CATEGORIES.includes(reason)) {
      if (!prefs.updateTypes[event.type] || !scopeAllows(prefs, reason, 'push', event, await contextMatches(event, prefs.context))) continue;
      if (reason !== 'subscribedThreads' || await Subscription.exists({ recipient_key: notification.recipient_key, root_post_id: event.root_post_id, created_at: { $lte: event.occurred_at } })) return true;
    } else if (channelEnabled(prefs[reason], 'push', event)) {
      if (reason === 'ownUpdates' && !ownPushAllowed(event, notification.recipient_key, prefs, chat)) continue;
      if (reason !== 'subscribedThreads' || await Subscription.exists({ recipient_key: notification.recipient_key, root_post_id: event.root_post_id, created_at: { $lte: event.occurred_at } })) return true;
    }
  }
  return false;
}
async function deliverOnce({ send = sendConfirmed, now = new Date(), limit = 20 } = {}) {
  if (!isOneSignalEnabled()) return { processed: 0 };
  const stale = new Date(now.getTime() - 60000);
  await Notification.updateMany({ push_state: 'sending', push_attempts: { $gte: 3 }, push_attempted_at: { $lt: stale } }, { $set: { push_state: 'failed' } });
  const rows = await Notification.find({ $or: [{ push_state: 'pending' }, { push_state: 'sending', push_attempted_at: { $lt: stale } }], push_attempts: { $lt: 3 } }).sort({ created_at: 1 }).limit(limit).lean();
  let processed = 0;
  for (const row of rows) {
    const claimed = await Notification.findOneAndUpdate({ _id: row._id, push_state: row.push_state, push_attempts: row.push_attempts, push_attempted_at: row.push_attempted_at },
      { $set: { push_state: 'sending', push_attempted_at: now }, $inc: { push_attempts: 1 } }, { new: true }).lean();
    if (!claimed) continue;
    let user, event, allowed;
    try {
      user = row.recipient_key.startsWith('user:') ? await User.findById(row.recipient_key.slice(5)).lean() : null;
      event = await Event.findById(row.event_id).lean();
      allowed = await eligible(row, event, user);
    } catch {
      // A failed database check is not a denied permission: retain the lease for retry.
      if (claimed.push_attempts >= 3) await Notification.updateOne({ _id: row._id }, { $set: { push_state: 'failed' } });
      continue;
    }
    if (!allowed || now - new Date(row.created_at) > 86400000) {
      await Notification.updateOne({ _id: row._id }, { $set: { push_state: 'suppressed' } }); continue;
    }
    const scope = { recipient_key: row.recipient_key, root_post_id: event.root_post_id, type: event.type };
    let window;
    try { window = await Window.findOneAndUpdate({ ...scope, $or: [{ next_at: { $lte: now } }, { notification_id: row._id }] },
      { $set: { next_at: new Date(now.getTime() + 30000), notification_id: row._id }, $setOnInsert: scope }, { upsert: true, new: true }).lean(); }
    catch (error) { if (error.code !== 11000) throw error; }
    if (!window) { await Notification.updateOne({ _id: row._id }, { $set: { push_state: 'suppressed' } }); continue; }
    const config = getOneSignalConfig();
    const url = `${getApplicationConfig().appUrl}/floor/${event.floor_id}/room/${event.room_id}?activity=${event._id}`;
    try {
      await send({ app_id: config.appId, include_external_user_ids: [buildOneSignalExternalId(user._id)], channel_for_external_user_ids: 'push',
        headings: { ja: 'ISeeeTLの更新', en: 'ISeeeTL update' }, contents: { ja: '関連する投稿が更新されました。アクティビティで確認できます。', en: 'A post you follow has an update. Open Activity to view it.' },
        url, idempotency_key: claimed.push_key });
      await Notification.updateOne({ _id: row._id }, { $set: { push_state: 'sent' } });
    } catch (error) {
      // Keep uncertain requests in the leased state until retry, with the same key.
      if (error.retryable !== true || claimed.push_attempts >= 3) await Notification.updateOne({ _id: row._id }, { $set: { push_state: 'failed' } });
    }
    processed++;
  }
  return { processed };
}
module.exports = { sendConfirmed, eligible, deliverOnce };
