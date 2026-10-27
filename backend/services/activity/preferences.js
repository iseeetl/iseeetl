const AppError = require('../../utils/appError');
const CATEGORIES = Object.freeze(['roomActivity', 'relatedActivity', 'ownUpdates', 'ownReactions', 'subscribedThreads']);
const PUBLIC_CATEGORIES = Object.freeze(['roomActivity', 'relatedActivity', 'subscribedThreads']);
const MODES = Object.freeze(['off', 'matching', 'all']);
const TYPES = Object.freeze(['reply', 'alternative', 'supplement', 'reaction']);
const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, names) => isObject(value) && Object.keys(value).every(key => names.includes(key));
const row = (notify, timeline, push, since) => ({ notify, timeline, push, since, timelineSince: since, pushSince: since });
function defaults({ legacyUser = {}, now = new Date() } = {}) {
  const legacyPush = { ownReply: legacyUser.push_enabled === true && legacyUser.reply_push_enabled === true,
    participantReply: legacyUser.push_enabled === true && legacyUser.replied_post_push_enabled === true,
    ownSupplement: legacyUser.push_enabled === true };
  return { schemaVersion: 3, preserveOwnNotifications: true,
    roomActivity: row(true, true, false, now), relatedActivity: row(false, false, false, now),
    ownUpdates: row(true, true, Object.values(legacyPush).some(Boolean), now),
    ownReactions: row(true, true, false, now), subscribedThreads: row(true, true, false, now),
    timelineEnabled: true, updateTypes: Object.fromEntries(TYPES.map(key => [key, true])),
    context: { globalQuery: null, columns: [] }, contextSince: now,
    // Read-only compatibility guard. An explicit ownUpdates choice replaces it.
    legacyPush, historyStart: null,
    visibility: { alternative: true, supplement: true, ai: true, hiddenAITagIds: [] },
  };
}
function normalize(value, options = {}) {
  if (!value) return defaults(options);
  if (value.schemaVersion >= 2) return { preserveOwnNotifications: true, ...structuredClone(value), schemaVersion: 3 };
  const next = defaults(options), old = value.roomActivity || {};
  for (const key of ['ownUpdates', 'ownReactions', 'subscribedThreads']) {
    if (value[key]) next[key] = row(value[key].notify, value[key].notify, value[key].push, value[key].since);
  }
  next.roomActivity.timeline = old.enabled !== false && old.scope !== 'related';
  next.relatedActivity = row(old.enabled === true && old.scope === 'related', old.enabled === true && old.scope === 'related', false, next.roomActivity.since);
  for (const type of TYPES) next.updateTypes[type] = old[type] !== false;
  next.legacyPush = { ownReply: !!value.ownUpdates?.push, participantReply: !!value.legacyReplyParticipants, ownSupplement: !!value.legacyOwnSupplement };
  next.ownUpdates.push = Object.values(next.legacyPush).some(Boolean);
  if (value.visibility) next.visibility = structuredClone(value.visibility);
  return next;
}
function normalizeContext(value) {
  if (!only(value, ['globalQuery', 'columns']) || !Array.isArray(value.columns) || value.columns.length > 10 || JSON.stringify(value).length > 30000) invalid();
  const { mapListRequest } = require('../../validates/timelineQuery');
  const check = query => query == null ? null : mapListRequest({ room_id: '000000000000000000000001' }, { serverQuery: query }, true).serverQuery;
  return { globalQuery: check(value.globalQuery), columns: value.columns.map(check) };
}
function parsePatch(input, previous, { guest = false, now = new Date() } = {}) {
  if (!only(input, [...CATEGORIES, 'timelineEnabled', 'updateTypes', 'visibility', 'context', 'scopes'])) invalid();
  const old = normalize(previous), next = structuredClone(old);
  // Retain the pre-migration shared room history, without synthesizing personal notifications.
  if (!next.historyStart) {
    next.historyStart = now;
    for (const key of ['roomActivity', 'relatedActivity']) next[key].since = now;
  }
  for (const key of CATEGORIES) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (!only(value, ['notify', 'timeline', 'push']) || typeof value.notify !== 'boolean' || typeof value.push !== 'boolean' ||
      (value.timeline !== undefined && typeof value.timeline !== 'boolean')) invalid();
    const timeline = value.timeline ?? (value.notify && old[key].timeline);
    if ((value.push || timeline) && !value.notify || value.push && guest) invalid();
    next[key] = { notify: value.notify, timeline, push: value.push,
      since: value.notify && !old[key].notify ? now : old[key].since,
      timelineSince: timeline && !old[key].timeline ? now : old[key].timelineSince,
      pushSince: value.push && (!old[key].push || key === 'ownUpdates' && old.legacyPush && (value.push !== old[key].push || value.notify !== old[key].notify)) ? now : old[key].pushSince };
    if (key === 'ownUpdates' && (value.push !== old[key].push || value.notify !== old[key].notify)) next.legacyPush = null;
  }
  if (Object.hasOwn(input, 'scopes')) {
    if (!only(input.scopes, PUBLIC_CATEGORIES) || PUBLIC_CATEGORIES.some(key => !Object.hasOwn(input.scopes, key))) invalid();
    const oldScopes = scopesFor(old); next.scopes = {};
    for (const key of PUBLIC_CATEGORIES) {
      const value = input.scopes[key];
      if (!only(value, ['notify', 'timeline', 'push']) || ['notify','timeline','push'].some(ch => !MODES.includes(value[ch]))) invalid();
      if (MODES.indexOf(value.notify) < Math.max(MODES.indexOf(value.timeline), MODES.indexOf(value.push)) || guest && value.push !== 'off') invalid();
      next.scopes[key] = { ...value };
      for (const channel of ['notify', 'timeline', 'push']) {
        next[key][channel] = value[channel] !== 'off';
        if (MODES.indexOf(value[channel]) > MODES.indexOf(oldScopes[key][channel])) next[key][channel === 'notify' ? 'since' : channel + 'Since'] = now;
      }
    }
    // An explicit save replaces the legacy individual rows, never a background sync.
    next.preserveOwnNotifications = false; next.legacyPush = null;
    for (const key of ['ownUpdates','ownReactions']) next[key] = { ...next[key], notify: false, timeline: false, push: false };
  } else if (next.scopes) {
    // Older clients can narrow/enable a row without losing its saved filter mode.
    for (const key of PUBLIC_CATEGORIES) if (Object.hasOwn(input, key)) {
      for (const channel of ['notify','timeline','push']) next.scopes[key][channel] = next[key][channel] ? (next.scopes[key][channel] === 'off' ? 'matching' : next.scopes[key][channel]) : 'off';
    }
  }
  if (Object.hasOwn(input, 'timelineEnabled')) {
    if (typeof input.timelineEnabled !== 'boolean') invalid();
    next.timelineEnabled = input.timelineEnabled;
    if (input.timelineEnabled && !old.timelineEnabled) for (const key of CATEGORIES) next[key].timelineSince = now;
  }
  if (Object.hasOwn(input, 'updateTypes')) {
    if (!only(input.updateTypes, TYPES) || TYPES.some(key => typeof input.updateTypes[key] !== 'boolean')) invalid();
    next.updateTypes = { ...input.updateTypes };
  }
  if (Object.hasOwn(input, 'context')) {
    next.context = normalizeContext(input.context);
    if (JSON.stringify(next.context) !== JSON.stringify(old.context)) next.contextSince = now;
  }
  if (Object.hasOwn(input, 'visibility')) {
    const value = input.visibility;
    if (!only(value, ['alternative', 'supplement', 'ai', 'hiddenAITagIds']) ||
      ['alternative', 'supplement', 'ai'].some(key => typeof value[key] !== 'boolean') ||
      !Array.isArray(value.hiddenAITagIds) || value.hiddenAITagIds.length > 500 ||
      value.hiddenAITagIds.some(id => typeof id !== 'string' || !(id === '__unknown__' || /^[a-f0-9]{24}$/i.test(id)))) invalid();
    next.visibility = { ...value, hiddenAITagIds: [...new Set(value.hiddenAITagIds.map(id => id.toLowerCase()))] };
  }
  return next;
}
function channelEnabled(pref, channel, event) {
  if (!pref?.notify || channel !== 'notify' && !pref[channel]) return false;
  const boundary = channel === 'notify' ? pref.since : pref[channel + 'Since'] || pref.since;
  return !boundary || !event.occurred_at || new Date(boundary) <= new Date(event.occurred_at);
}
function scopesFor(preferences) {
  return Object.fromEntries(PUBLIC_CATEGORIES.map(key => [key, Object.fromEntries(['notify','timeline','push'].map(channel =>
    [channel, preferences.scopes?.[key]?.[channel] ?? (preferences[key]?.[channel] ? (key === 'subscribedThreads' ? 'all' : 'matching') : 'off')]))]));
}
function scopeAllows(preferences, key, channel, event, contextMatched) {
  if (!channelEnabled(preferences[key], channel, event)) return false;
  const mode = scopesFor(preferences)[key]?.[channel];
  return mode === 'all' || mode === 'matching' && contextMatched &&
    (!preferences.contextSince || !event.occurred_at || new Date(preferences.contextSince) <= new Date(event.occurred_at));
}
function eventVisible(event, preferences) {
  const view = preferences.visibility;
  if (event.media && !view.alternative) return false;
  if (event.supplement_id && !view.supplement) return false;
  if (event.ai_kind && (!view.ai || view.hiddenAITagIds.includes(String(event.ai_tag_id || '__unknown__')))) return false;
  return true;
}
module.exports = { CATEGORIES, PUBLIC_CATEGORIES, MODES, scopesFor, scopeAllows, TYPES, defaults, normalize, normalizeContext, parsePatch, eventVisible, channelEnabled };
