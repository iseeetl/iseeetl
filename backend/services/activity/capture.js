const { Types } = require('mongoose');
const { eventFor, appendEvents } = require('./outbox');
const { actorKey } = require('./contract');
const { id } = require('./access');
const ALT = { image_caption: 'image', video_description: 'video', audio_description: 'audio' };
const valueAt = (item, path) => path.split('.').reduce((value, key) => value?.[key], item);
const equal = (a, b) => a == null && b == null || JSON.stringify(a) === JSON.stringify(b) ||
  (a?._bsontype === 'ObjectId' || b?._bsontype === 'ObjectId') && id(a) === id(b);
function matches(value, expected) {
  if (expected && typeof expected === 'object' && !expected._bsontype) {
    if (Object.hasOwn(expected, '$exists')) return (value !== undefined) === expected.$exists;
    if (Object.hasOwn(expected, '$ne')) return !equal(value, expected.$ne);
  }
  return equal(value, expected);
}
function resolvePath(chat, path, query, options) {
  const parts = path.split('.');
  let item = chat, concrete = [], replyId = null, supplementId = null;
  const guards = {};
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (Array.isArray(item)) {
      const arrayName = parts[i - 1];
      let index, constraints = [];
      if (/^\d+$/.test(key)) index = Number(key);
      else if (key === '$') {
        const requested = query[`${arrayName}._id`] || query[arrayName]?.$elemMatch?._id;
        if (!requested) return null;
        index = item.findIndex(entry => id(entry) === id(requested));
      } else if (/^\$\[\w+\]$/.test(key)) {
        const name = key.slice(2, -1);
        constraints = (options.arrayFilters || []).flatMap(filter => Object.entries(filter)
          .filter(([field]) => field.startsWith(`${name}.`)).map(([field, value]) => [field.slice(name.length + 1), value]));
        if (!constraints.length) return null;
        index = item.findIndex(entry => constraints.every(([field, value]) => matches(valueAt(entry, field), value)));
      } else return null;
      if (index < 0 || !item[index] || item[index].delete_flg) return null;
      item = item[index]; concrete.push(String(index));
      guards[`${concrete.join('.')}._id`] = item._id;
      for (const [field, value] of constraints) guards[`${concrete.join('.')}.${field}`] = value;
      if (arrayName === 'replies') replyId = item._id;
      if (arrayName === 'supplementaries') supplementId = item._id;
    } else { item = item?.[key]; concrete.push(key); }
    if (item === undefined) return null;
  }
  return { item, concrete: concrete.join('.'), replyId, supplementId, guards };
}
function capture(chat, query, update, options = {}, explicitActor = null) {
  const events = [], guards = {}, edited = new Set();
  const locate = path => path ? resolvePath(chat, path, query, options) : { item: chat, concrete: '', replyId: null, supplementId: null, guards: {} };
  for (const [path, pushed] of Object.entries(update.$push || {})) {
    const parts = path.split('.'), field = parts.pop();
    if (!['replies', 'supplementaries', 'reactions', 'alternative_reactions'].includes(field)) continue;
    const target = locate(parts.join('.'));
    if (!target || target.item.delete_flg) continue;
    Object.assign(guards, target.guards);
    for (const entry of pushed.$each || [pushed]) {
      const actor = actorKey(entry) || explicitActor;
      if (!actor) continue;
      if (!entry._id) entry._id = new Types.ObjectId();
      const owner = target.replyId ? chat.replies.find(reply => id(reply) === id(target.replyId)) : chat;
      const reaction = field.endsWith('reactions');
      events.push(eventFor({ chat, actor, owner,
        type: field === 'replies' ? 'reply' : field === 'supplementaries' ? 'supplement' : 'reaction',
        item: field === 'supplementaries' ? entry : target.item,
        replyId: field === 'replies' ? entry._id : target.replyId,
        supplementId: field === 'supplementaries' ? entry._id : target.supplementId,
        reactionId: reaction ? entry._id : null, media: field === 'alternative_reactions' ? entry.media_kind : null,
      }));
    }
  }
  for (const [path, value] of Object.entries(update.$set || {})) {
    const parts = path.split('.'), field = parts.pop();
    const target = locate(parts.join('.'));
    if (!target || target.item.delete_flg || equal(target.item[field], value)) continue;
    const media = ALT[field];
    if (!media && !(target.supplementId && ['content', 'title'].includes(field))) continue;
    if (media && !target.item[`${media}_name`]) continue;
    const prefix = parts.join('.');
    const changedActor = update.$set[`${prefix}.user`];
    const actor = changedActor ? `user:${id(changedActor)}` : explicitActor;
    if (!actor) continue;
    Object.assign(guards, target.guards);
    guards[[target.concrete, field].filter(Boolean).join('.')] = target.item[field] ?? null;
    const key = `${target.concrete}:${media || 'supplement'}`;
    if (edited.has(key)) continue;
    edited.add(key);
    events.push(eventFor({ chat, actor, owner: target.replyId ? chat.replies.find(reply => id(reply) === id(target.replyId)) : chat, item: target.item, replyId: target.replyId, supplementId: target.supplementId,
      type: media ? 'alternative' : 'supplement', media: media || null, action: target.item[field] ? 'edited' : 'added' }));
  }
  return { events, guards, update: appendEvents(update, events) };
}
function plugin(schema) {
  schema.pre('save', function() {
    if (process.env.ACTIVITY_NOTIFICATIONS_ENABLED !== 'true' || !this.isNew) return;
    const actor = actorKey(this);
    if (actor) this.activity_outbox = [eventFor({ chat: this, type: 'post', actor })];
  });
  schema.pre('findOneAndUpdate', async function() {
    if (process.env.ACTIVITY_NOTIFICATIONS_ENABLED !== 'true') return;
    const update = this.getUpdate();
    if (!update || update.$push?.activity_outbox || !Object.keys(update).some(key => ['$set', '$push'].includes(key))) return;
    if (!this.getFilter()._id) return;
    const before = await this.model.findOne(this.getFilter()).lean();
    if (!before) return;
    const result = capture(before, this.getFilter(), update, this.getOptions(), require('./context').getActor());
    if (!result.events.length) return;
    this.setUpdate(result.update);
    if (Object.keys(result.guards).length) this.setQuery({ $and: [this.getFilter(), result.guards] });
  });
}
module.exports = { capture, resolvePath, plugin };
