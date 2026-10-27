const request = require('supertest');
const { createUserToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const Chat = require('../../../models/Chat');
const Event = require('../../../models/ActivityEvent');
const Read = require('../../../models/ActivityRead');
const Notification = require('../../../models/ActivityNotification');
const Preference = require('../../../models/ActivityPreference');
const Subscription = require('../../../models/ActivitySubscription');
const context = require('../../../services/activity/context');
const { drainOnce } = require('../../../services/activity/materialize');
const serialize = require('../../../services/timeline/shared/timelineSerializer');
let owner, actor, floor, room, post, app, base;
beforeAll(async () => { for (const model of [Event, Read, Notification, Preference, Subscription]) await model.createIndexes(); });
beforeEach(async () => {
  process.env.ACTIVITY_NOTIFICATIONS_ENABLED = 'true';
  owner = await createUser({ role: 'Author' }); actor = await createUser({ role: 'Author' });
  floor = await createFloor(owner); room = await createRoom(owner, floor);
  post = await Chat.create({ floor: floor._id, room: room._id, user: owner._id, content: 'Original', image_name: 'a.jpg', image_caption: 'before' });
  app = buildErrorHandledApp({ mounts: [ { path: '/api', handler: context.middleware }, { path: '/api', handler: require('../../../routes/activity.route')() } ] });
  base = `/api/rooms/${room._id}/activity`;
});
afterEach(() => { delete process.env.ACTIVITY_NOTIFICATIONS_ENABLED; });
const auth = user => ({ Authorization: `Bearer ${createUserToken(user)}` });
async function reply() { return Chat.findOneAndUpdate({ _id: post._id }, { $push: { replies: { user: actor._id, content: 'Reply' } } }, { new: true, runValidators: true }); }
test('atomic outbox survives a worker stop, retry is unique and private metadata stays private', async () => {
  const updated = await reply();
  expect(serialize(updated).activity_outbox).toBeUndefined();
  const pending = await Chat.findById(post._id).select('+activity_outbox').lean();
  expect(pending.activity_outbox).toHaveLength(2);
  expect(await Event.countDocuments()).toBe(0);
  await drainOnce(); await drainOnce();
  expect(await Event.countDocuments()).toBe(2);
  expect(await Notification.countDocuments({ recipient_key: `user:${owner._id}` })).toBe(1);
  expect((await Chat.findById(post._id).select('+activity_outbox')).activity_outbox).toHaveLength(0);
});
test('history persists through reopening; explicit IDs mark read without swallowing new arrivals', async () => {
  await reply(); await drainOnce();
  const page = await request(app).get(base+'?view=personal').set(auth(owner));
  expect(page.status).toBe(200); expect(page.body.entries).toHaveLength(1);
  expect(JSON.stringify(page.body)).not.toMatch(/actor_key|guest_id|recipient_key|activity_outbox/);
  await reply(); await drainOnce();
  const marked = await request(app).post(base+'/read').set(auth(owner)).send({ eventIds: [page.body.entries[0].id] });
  expect(marked.status).toBe(200);
  const next = await request(app).get(base+'?view=personal&unread=true').set(auth(owner));
  expect(next.body.entries).toHaveLength(1); expect(next.body.entries[0].read).toBe(false);
  expect((await request(app).get(base+'?view=personal').set(auth(owner))).body.entries).toHaveLength(2);
});
test('room authorization applies to list, target, read, subscription, preferences', async () => {
  await drainOnce(); const event = await Event.findOne();
  room.member_only = true; await room.save();
  for (const path of [base, base+'/preferences', base+'/subscriptions', `${base}/${event._id}/target`]) {
    expect((await request(app).get(path).set(auth(actor))).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
  }
  expect((await request(app).post(base+'/read').set(auth(actor)).send({ eventIds: [String(event._id)] })).status).toBe(403);
  expect((await request(app).put(`${base}/subscriptions/${post._id}`).set(auth(actor)).send({ enabled: true })).status).toBe(403);
});
test('preference version rejects lost updates; settings are isolated by room', async () => {
  const initial = await request(app).get(base+'/preferences').set(auth(owner));
  expect(initial.status).toBe(200); expect(initial.body.version).toBe(0);
  const payload = { version: 0, value: { ownReactions: { notify: false, push: false } } };
  expect((await request(app).put(base+'/preferences').set(auth(owner)).send(payload)).status).toBe(200);
  expect((await request(app).put(base+'/preferences').set(auth(owner)).send(payload)).status).toBe(409);
  const room2 = await createRoom(owner, floor);
  const other = await request(app).get(`/api/rooms/${room2._id}/activity/preferences`).set(auth(owner));
  expect(other.body.version).toBe(0); expect(other.body.value.ownReactions.notify).toBe(true);
});
test('translations do not add events; missing/deleted target keeps history but cannot return its text', async () => {
  await reply(); await drainOnce();
  const event = await Event.findOne({ type: 'reply' });
  await Chat.findOneAndUpdate({ _id: post._id }, { $set: { translations: [] } }); await drainOnce();
  expect(await Event.countDocuments()).toBe(2);
  await Chat.updateOne({ _id: post._id }, { $set: { 'replies.0.delete_flg': true } });
  const opened = await request(app).get(`${base}/${event._id}/target`).set(auth(owner));
  expect(opened.body).toEqual({ available: false });
  const history = await request(app).get(base+'?view=personal').set(auth(owner));
  expect(history.body.entries[0]).toMatchObject({ available: false, preview: '' });
});
test('bell does not replay earlier events, and a reply does not silently subscribe its author', async () => {
  await reply(); await drainOnce();
  expect(await Subscription.countDocuments()).toBe(0);
  await request(app).put(`${base}/subscriptions/${post._id}`).set(auth(actor)).send({ enabled: true });
  expect(await Notification.countDocuments({ recipient_key: `user:${actor._id}` })).toBe(0);
  await Chat.findOneAndUpdate({ _id: post._id }, { $push: { replies: { user: owner._id, content: 'Next' } } }); await drainOnce();
  expect(await Notification.countDocuments({ recipient_key: `user:${actor._id}` })).toBe(1);
});

test('after cursor catches up across pages without losing equal-time events', async () => {
  await drainOnce();
  const first = await request(app).get(base).set(auth(owner));
  for (let i=0;i<5;i++) await reply(); await drainOnce();
  const page = await request(app).post(base+'/search').set(auth(owner)).send({ after: first.body.latestCursor, limit: 2 });
  expect(page.status).toBe(200); expect(page.body.entries).toHaveLength(2);
  const next = await request(app).post(base+'/search').set(auth(owner)).send({ after: first.body.latestCursor, cursor: page.body.nextCursor, limit: 5 });
  expect(next.body.entries).toHaveLength(3);
  expect(new Set([...page.body.entries,...next.body.entries].map(x=>x.id)).size).toBe(5);
});
test('hidden AI explanation does not disclose its preview and can be opened deliberately', async () => {
  await Chat.findOneAndUpdate({ _id: post._id }, { $push: { supplementaries: { user: actor._id, title: 'AI', content: 'Hidden explanation', meta: { analysis_kind: 'vision' } } } }); await drainOnce();
  await request(app).put(base+'/preferences').set(auth(owner)).send({ version: 0, value: { visibility: { alternative:true,supplement:true,ai:false,hiddenAITagIds:[] } } });
  const page = await request(app).get(base+'?view=personal').set(auth(owner));
  expect(page.body.entries[0]).toMatchObject({ hidden:true,preview:'',ai:true });
  const target = await request(app).get(`${base}/${page.body.entries[0].id}/target`).set(auth(owner));
  expect(target.body.available).toBe(true);
});
test('guest identity cannot be selected by body or forged token', async () => {
  const token = require('../../../services/guestAuth.service').buildAccessToken('guest-a');
  const page = await request(app).get(base+'/preferences').set('x-guest-token',token);
  expect(page.status).toBe(200);
  const denied = await request(app).put(base+'/preferences').set('x-guest-token','forged').send({ version:0,value:{} });
  expect(denied.status).toBe(401);
  const saved = await request(app).put(base+'/preferences').set('x-guest-token',token).send({ version:0,guest_id:'guest-b',value:{ownReactions:{notify:false,push:false}} });
  expect(saved.status).toBe(200);
  expect(await Preference.countDocuments({recipient_key:'guest:guest-b'})).toBe(0);
  expect(await Preference.countDocuments({recipient_key:'guest:guest-a'})).toBe(1);
});
test('flat reply notifies previous reply authors and bell subscribers once', async () => {
  const third = await createUser({role:'Author'});
  await reply(); await drainOnce();
  await Subscription.create({recipient_key:`user:${actor._id}`,room_id:room._id,root_post_id:post._id,created_at:new Date(0)});
  await Chat.findOneAndUpdate({_id:post._id},{$push:{replies:{user:third._id,content:'Next reply'}}}); await drainOnce();
  const rows=await Notification.find({recipient_key:`user:${actor._id}`}).lean();
  expect(rows).toHaveLength(1); expect(rows[0].reasons).toEqual(expect.arrayContaining(['ownUpdates','subscribedThreads']));
  expect(await Subscription.countDocuments({recipient_key:`user:${third._id}`})).toBe(0);
});

test('room history can be kept with no banner or push and survives opt-out',async()=>{
  const observer=await createUser({role:'Author'});
  const save=async(version,value)=>request(app).put(base+'/preferences').set(auth(observer)).send({version,value});
  let result=await save(0,{roomActivity:{notify:true,timeline:false,push:false},context:{globalQuery:{keyword:'Original'},columns:[]}});
  expect(result.status).toBe(200);await reply();await drainOnce();
  expect(await Notification.countDocuments({recipient_key:`user:${observer._id}`})).toBe(1);
  result=await save(1,{roomActivity:{notify:false,timeline:false,push:false}});expect(result.status).toBe(200);
  await reply();await drainOnce();
  const page=await request(app).get(base).set(auth(observer));
  expect(page.body.entries.filter(x=>x.reasons.includes('roomActivity'))).toHaveLength(1);
  expect(await Notification.countDocuments({recipient_key:`user:${observer._id}`})).toBe(1);
});
test('nonmatching room filters do not create personal notification history',async()=>{
  const observer=await createUser({role:'Author'});
  await request(app).put(base+'/preferences').set(auth(observer)).send({version:0,value:{context:{globalQuery:{keyword:'NO MATCH'},columns:[]}}});
  await reply();await drainOnce();expect(await Notification.countDocuments({recipient_key:`user:${observer._id}`})).toBe(0);
});
test('history records remain available when saved filters later change',async()=>{
  const observer=await createUser({role:'Author'});
  await request(app).put(base+'/preferences').set(auth(observer)).send({version:0,value:{context:{globalQuery:{keyword:'Original'},columns:[]}}});
  await reply();await drainOnce();
  await request(app).put(base+'/preferences').set(auth(observer)).send({version:1,value:{context:{globalQuery:{keyword:'different'},columns:[]}}});
  const page=await request(app).post(base+'/search').set(auth(observer)).send({globalQuery:{keyword:'different'},columns:[]});
  expect(page.body.entries.some(x=>x.reasons.includes('roomActivity'))).toBe(true);
});
test('guest room preferences do not expose another guest history or allow push',async()=>{
  const token=require('../../../services/guestAuth.service').buildAccessToken('guest-watch');
  const saved=await request(app).put(base+'/preferences').set('x-guest-token',token).send({version:0,value:{roomActivity:{notify:true,timeline:false,push:false},context:{globalQuery:null,columns:[]}}});
  expect(saved.status).toBe(200);await reply();await drainOnce();
  expect(await Notification.countDocuments({recipient_key:'guest:guest-watch'})).toBe(1);
  const denied=await request(app).put(base+'/preferences').set('x-guest-token',token).send({version:1,value:{roomActivity:{notify:true,timeline:false,push:true}}});expect(denied.status).toBe(400);
});
