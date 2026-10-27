const AppError = require('../../utils/appError');
const Chat = require('../../models/Chat');
const User = require('../../models/User');
const Event = require('../../models/ActivityEvent');
const Notification = require('../../models/ActivityNotification');
const Read = require('../../models/ActivityRead');
const Preference = require('../../models/ActivityPreference');
const Subscription = require('../../models/ActivitySubscription');
const { defaults, normalize, parsePatch, eventVisible } = require('./preferences');
const { authorize, targetFor, id } = require('./access');
const { TIMELINE_POPULATE_WITH_REACTIONS } = require('../timeline/shared/chatPopulate');
const serialize = require('../timeline/shared/timelineSerializer');
const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);

async function getPreferences(roomId, identity) {
  await authorize(roomId, identity);
  const saved = await Preference.findOne({ recipient_key: identity.key, room_id: roomId }).lean();
  if (saved) return { version: saved.version, value: normalize(saved.value, { now: new Date(0) }) };
  const legacyUser = identity.jwtPayload ? await User.findById(identity.jwtPayload.user_id).select('push_enabled reply_push_enabled replied_post_push_enabled').lean() : {};
  return { version: 0, value: defaults({ legacyUser, now: new Date(0) }) };
}
async function savePreferences(roomId, identity, body) {
  await authorize(roomId, identity);
  if (!body || Object.keys(body).some(key => !['version', 'value'].includes(key)) || !Number.isSafeInteger(body.version) || body.version < 0) invalid();
  const previous = await getPreferences(roomId, identity);
  if (previous.version !== body.version) throw new AppError({ code: 'CONFLICT' });
  const now = new Date();
  const value = parsePatch(body.value, previous.value, { guest: !!identity.guest, now });
  if (!previous.version) {
    try {
      await Preference.create({ recipient_key: identity.key, room_id: roomId, value, version: 1, created_at: now, updated_at: now });
    } catch (error) { if (error.code === 11000) throw new AppError({ code: 'CONFLICT' }); throw error; }
    return { version: 1, value };
  }
  const result = await Preference.findOneAndUpdate({ recipient_key: identity.key, room_id: roomId, version: body.version },
    { $set: { value, updated_at: now }, $inc: { version: 1 } }, { new: true, runValidators: true }).lean();
  if (!result) throw new AppError({ code: 'CONFLICT' });
  return { version: result.version, value: result.value };
}
const encodeCursor = event => Buffer.from(JSON.stringify([new Date(event.occurred_at).toISOString(), id(event)])).toString('base64url');
function decodeCursor(value) {
  if (typeof value !== 'string' || value.length > 200) invalid();
  let result;
  try { result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invalid(); }
  if (!Array.isArray(result) || result.length !== 2 || !validId(result[1]) || typeof result[0] !== 'string' ||
    !Number.isFinite(Date.parse(result[0]))) invalid();
  return { occurred_at: new Date(result[0]), _id: result[1] };
}
async function list(roomId, identity, options = {}) {
  await authorize(roomId, identity);
  if (Object.keys(options).some(key => !['view', 'unread', 'cursor', 'after', 'limit', 'globalQuery', 'columns'].includes(key))) invalid();
  const view = options.view || 'room';
  if (!['room', 'personal'].includes(view) || ![undefined, 'true', 'false', true, false].includes(options.unread)) invalid();
  const limit = options.limit === undefined ? 30 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
  const preferences = (await getPreferences(roomId, identity)).value;
  const query = { room_id: roomId };
  const mongoose = require('mongoose');
  const boundaries = [];
  for (const [key, op] of [['cursor', '$lt'], ['after', '$gt']]) if (options[key]) {
    const cursor = decodeCursor(options[key]);
    boundaries.push({ $or: [{ occurred_at: { [op]: cursor.occurred_at } }, { occurred_at: cursor.occurred_at, _id: { [op]: new mongoose.Types.ObjectId(cursor._id) } }] });
  }
  if (boundaries.length) query.$and = boundaries;
  // Lookups keep paging bounded; neither all history IDs nor full post bodies are loaded at once.
  query.room_id = new mongoose.Types.ObjectId(roomId);
  const pipeline = [{ $match: query }, { $sort: { occurred_at: -1, _id: -1 } }];
  const { contextClauses } = require('./filterContext');
  const clauses = await contextClauses({ globalQuery: options.globalQuery || null, columns: options.columns || [] });
  if (view === 'room' && clauses.length) pipeline.push({ $lookup: { from: Chat.collection.name,
    let: { post: '$root_post_id' }, pipeline: [{ $match: { room: query.room_id, delete_flg: false, $expr: { $eq: ['$_id', '$$post'] }, $and: clauses } }, { $project: { _id: 1 } }], as: 'matchedPost' } });
  const lookup = (model, as) => ({ $lookup: { from: model.collection.name, let: { event: '$_id' }, pipeline: [
    { $match: { recipient_key: identity.key, $expr: { $eq: ['$event_id', '$$event'] } } }, { $limit: 1 },
  ], as } });
  pipeline.push(lookup(Notification, 'notification'));
  if (view === 'personal') pipeline.push({ $match: { 'notification.reasons': { $in: ['relatedActivity', 'ownUpdates', 'ownReactions', 'subscribedThreads', 'savedFilter', 'legacyReplyParticipants', 'legacyOwnSupplement'] } } });
  else {
    const legacy = { ...(preferences.historyStart ? { occurred_at: { $lt: new Date(preferences.historyStart) } } : {}),
      ...(clauses.length ? { 'matchedPost.0': { $exists: true } } : {}) };
    pipeline.push({ $match: { $or: [{ 'notification.0': { $exists: true } }, legacy] } });
  }
  pipeline.push(lookup(Read, 'read'));
  if (options.unread === true || options.unread === 'true') pipeline.push({ $match: { 'read.0': { $exists: false } } });
  pipeline.push({ $limit: limit + 1 });
  const rows = await Event.aggregate(pipeline);
  const page = rows.slice(0, limit);
  const chats = await Chat.find({ _id: { $in: [...new Set(page.map(row => id(row.root_post_id)))] }, room: roomId, delete_flg: false }).lean();
  const map = new Map(chats.map(chat => [id(chat), chat]));
  const userIds = [...new Set(page.filter(row => row.actor_key.startsWith('user:')).map(row => row.actor_key.slice(5)))].filter(validId);
  const users = await User.find({ _id: { $in: userIds }, delete_flg: false }).select('_id username').lean();
  const names = new Map(users.map(user => [`user:${id(user)}`, user.username]));
  const entries = page.map(event => {
    const chat = map.get(id(event.root_post_id));
    const target = targetFor(chat, event);
    const text = target ? (event.media ? target[{ image: 'image_caption', video: 'video_description', audio: 'audio_description' }[event.media]] : target.content) : '';
    const guestName = chat && [chat, ...(chat.replies || []), ...(chat.supplementaries || []), ...(chat.replies || []).flatMap(reply => reply.supplementaries || [])]
      .find(item => item.guest_id && `guest:${item.guest_id}` === event.actor_key)?.guest_name;
    return { id: id(event), type: event.type, action: event.action, occurredAt: event.occurred_at,
      postId: id(event.root_post_id), replyId: event.reply_id ? id(event.reply_id) : null,
      supplementId: event.supplement_id ? id(event.supplement_id) : null, media: event.media, reactionId: event.reaction_id ? id(event.reaction_id) : null,
      ai: !!event.ai_kind, aiTagId: event.ai_tag_id ? id(event.ai_tag_id) : null,
      read: !!event.read.length, available: !!target, hidden: !eventVisible(event, preferences),
      actorName: names.get(event.actor_key) || guestName || null,
      ownAction: event.actor_key === identity.key, preview: eventVisible(event, preferences) ? String(text || '').slice(0, 160) : '',
      reasons: event.notification?.[0]?.reasons || [] };
  });
  return { entries, latestCursor: page.length ? encodeCursor(page[0]) : null, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
}
async function markRead(roomId, identity, eventIds) {
  await authorize(roomId, identity);
  if (!Array.isArray(eventIds) || eventIds.length > 100 || eventIds.some(value => !validId(value))) invalid();
  const found = await Event.find({ _id: { $in: eventIds }, room_id: roomId }).select('_id').lean();
  const now = new Date();
  if (found.length) {
    await Read.bulkWrite(found.map(event => ({ updateOne: {
      filter: { recipient_key: identity.key, event_id: event._id },
      update: { $setOnInsert: { recipient_key: identity.key, event_id: event._id, room_id: roomId, read_at: now } }, upsert: true,
    } })));
    await Notification.updateMany({ recipient_key: identity.key, room_id: roomId, event_id: { $in: found.map(row => row._id) }, read_at: null }, { $set: { read_at: now } });
  }
  return { readIds: found.map(id) };
}
async function openTarget(roomId, identity, eventId) {
  await authorize(roomId, identity);
  if (!validId(eventId)) invalid();
  const event = await Event.findOne({ _id: eventId, room_id: roomId }).lean();
  if (!event) throw new AppError({ code: 'NOT_FOUND' });
  const chat = await Chat.findOne({ _id: event.root_post_id, room: roomId, delete_flg: false }).populate(TIMELINE_POPULATE_WITH_REACTIONS);
  if (!targetFor(chat, event)) return { available: false };
  return { available: true, post: serialize(chat), target: {
    postId: id(event.root_post_id), replyId: event.reply_id ? id(event.reply_id) : null,
    supplementId: event.supplement_id ? id(event.supplement_id) : null, media: event.media, reactionId: event.reaction_id ? id(event.reaction_id) : null,
  } };
}
async function setSubscription(roomId, identity, postId, enabled) {
  await authorize(roomId, identity);
  if (!validId(postId) || typeof enabled !== 'boolean') invalid();
  const chat = await Chat.findOne({ _id: postId, room: roomId, delete_flg: false }).select('_id');
  if (!chat) throw new AppError({ code: 'NOT_FOUND' });
  const filter = { recipient_key: identity.key, room_id: roomId, root_post_id: postId };
  if (enabled) await Subscription.updateOne(filter, { $setOnInsert: { ...filter, created_at: new Date() } }, { upsert: true, runValidators: true });
  else await Subscription.deleteOne(filter);
  return { postId, enabled };
}
async function listSubscriptions(roomId, identity) {
  await authorize(roomId, identity);
  const rows = await Subscription.find({ recipient_key: identity.key, room_id: roomId }).select('root_post_id').lean();
  return { postIds: rows.map(row => id(row.root_post_id)) };
}
module.exports = { getPreferences, savePreferences, list, markRead, openTarget, setSubscription, listSubscriptions, decodeCursor, encodeCursor };
