const { channelEnabled, scopeAllows, PUBLIC_CATEGORIES } = require('./preferences');
const id = value => String(value?._id || value || '');
function actorKey(item) {
  if (item?.user) return `user:${id(item.user)}`;
  if (item?.guest_id) return `guest:${item.guest_id}`;
  return null;
}
const existed = (item, event) => item && !item.delete_flg && !item.deleted_at &&
  (!item.created_at || !event.occurred_at || new Date(item.created_at) <= new Date(event.occurred_at));
function threadAuthors(chat, event) {
  return new Set([chat, ...(chat?.replies || [])].filter(item => existed(item, event)).map(actorKey).filter(Boolean));
}
function involved(chat, key, event) {
  return [chat, ...(chat?.replies || [])].filter(item => existed(item, event)).some(item =>
    actorKey(item) === key || [...(item.reactions || []), ...(item.alternative_reactions || []), ...(item.supplementaries || [])]
      .some(info => existed(info, event) && (actorKey(info) === key || (info.reactions || []).some(r => existed(r, event) && actorKey(r) === key))));
}
function ownPushAllowed(event, key, preferences, chat) {
  if (!channelEnabled(preferences.ownUpdates, 'push', event)) return false;
  const guard = preferences.legacyPush;
  if (!guard) return true;
  if (event.type === 'supplement') return guard.ownSupplement && event.owner_key === key;
  if (event.type !== 'reply') return false;
  const rootOwner = chat ? actorKey(chat) : event.owner_key;
  return rootOwner === key ? guard.ownReply : guard.participantReply;
}
// Replies keep the existing flat structure: every reply belongs to the root post.
function planNotification({ event, recipientKey, preferences, subscribed = false, authoredThread = false,
  related = false, contextMatched = false, roomConfigured = contextMatched, filterMatched = false, authorized = true, visible = true, chat }) {
  if (!authorized || !recipientKey || event.actor_key === recipientKey) return null;
  const reasons = [], add = key => { if (channelEnabled(preferences?.[key], 'notify', event)) reasons.push(key); };
  const update = ['reply', 'alternative', 'supplement'].includes(event.type);
  if (preferences.preserveOwnNotifications !== false && update && (authoredThread || event.owner_key === recipientKey)) add('ownUpdates');
  if (preferences.preserveOwnNotifications !== false && event.type === 'reaction' && event.owner_key === recipientKey) add('ownReactions');
  const addScoped = key => { if (scopeAllows(preferences, key, 'notify', event, contextMatched)) reasons.push(key); };
  if (subscribed && preferences.updateTypes?.[event.type]) addScoped('subscribedThreads');
  if (roomConfigured && preferences.updateTypes?.[event.type]) {
    addScoped('roomActivity'); if (related) addScoped('relatedActivity');
  }
  if (filterMatched) reasons.push('savedFilter');
  if (!reasons.length) return null;
  return { eventId: id(event), recipientKey, reasons, suppressed: !visible,
    pushEligible: visible && reasons.some(reason => reason === 'savedFilter' || (PUBLIC_CATEGORIES.includes(reason) ? scopeAllows(preferences, reason, 'push', event, contextMatched) : reason === 'ownUpdates'
      ? ownPushAllowed(event, recipientKey, preferences, chat) : channelEnabled(preferences?.[reason], 'push', event))) };
}
module.exports = { actorKey, threadAuthors, involved, ownPushAllowed, planNotification };
