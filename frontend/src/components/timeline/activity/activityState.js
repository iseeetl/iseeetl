const PREFIX = 'iseeetl.activity.cursor.v1:';
export function cursorKey(identity, roomId, view) { return `${PREFIX}${identity}:${roomId}:${view}`; }
export function readCursor(key) { try { return localStorage.getItem(key) || null; } catch { return null; } }
export function saveCursor(key, value) { if (!value) return; try { localStorage.setItem(key, value); } catch { /* History stays on the server. */ } }
export function visibleEntry(entry, visibility) {
  return !(entry.media && !visibility.alternative || entry.supplementId && !visibility.supplement || entry.ai && (!visibility.ai || visibility.hiddenAITagIds.includes(entry.aiTagId || '__unknown__')));
}
export function timelineEnabled(entry, preferences, contextMatched = true) {
  if (preferences.timelineEnabled === false) return false;
  return (entry.reasons || []).some(reason => {
    const category = ['legacyReplyParticipants', 'legacyOwnSupplement'].includes(reason) ? 'ownUpdates' : reason;
    // Existing saved-filter push remains independently configured; the master also silences its banner.
    if (category === 'savedFilter') return true;
    if (['roomActivity','relatedActivity','subscribedThreads'].includes(category) && entry.type && preferences.updateTypes?.[entry.type] === false) return false;
    const mode = scopesFor(preferences)[category]?.timeline;
    if (mode === 'off' || mode === 'matching' && !contextMatched) return false;
    if (preferences.preserveOwnNotifications === false && ['ownUpdates','ownReactions'].includes(category)) return false;
    const pref = preferences[category];
    return pref?.notify && pref.timeline && (!pref.timelineSince || !entry.occurredAt || new Date(pref.timelineSince) <= new Date(entry.occurredAt));
  });
}

export function scopesFor(preferences) {
  return Object.fromEntries(['roomActivity','relatedActivity','subscribedThreads'].map(key => [key,
    Object.fromEntries(['notify','timeline','push'].map(channel => [channel, preferences.scopes?.[key]?.[channel] ??
      (preferences[key]?.[channel] ? (key === 'subscribedThreads' ? 'all' : 'matching') : 'off')]))]));
}
// Notifications always have a durable history row. Lowering history narrows dependents.
export function alignScopes(row, channel) {
  const rank = mode => ['off','matching','all'].indexOf(mode);
  if (channel === 'notify') { for (const key of ['timeline','push']) if (rank(row[key]) > rank(row.notify)) row[key] = row.notify; }
  else if (rank(row[channel]) > rank(row.notify)) row.notify = row[channel];
}
