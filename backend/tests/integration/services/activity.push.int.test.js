jest.mock('../../../config/featureFlags', () => ({...jest.requireActual('../../../config/featureFlags'),isOneSignalEnabled:()=>true,getOneSignalConfig:()=>({appId:'synthetic-app',externalIdSecret:'synthetic-external-id-secret-for-local-tests-only'})}));
const {createUser,createFloor,createRoom}=require('../_helpers/models');
const Chat=require('../../../models/Chat');
const Event=require('../../../models/ActivityEvent');
const Notification=require('../../../models/ActivityNotification');
const Window=require('../../../models/ActivityPushWindow');
const Read=require('../../../models/ActivityRead');
const Preference=require('../../../models/ActivityPreference');
const {drainOnce}=require('../../../services/activity/materialize');
const {deliverOnce}=require('../../../services/activity/push');
const {defaults}=require('../../../services/activity/preferences');
let owner,actor,room,post;
beforeAll(async()=>{for(const model of [Event,Notification,Window,Read,Preference])await model.createIndexes();});
beforeEach(async()=>{process.env.ACTIVITY_NOTIFICATIONS_ENABLED='true';owner=await createUser({role:'Author',push_enabled:true,reply_push_enabled:true});actor=await createUser({role:'Author'});const floor=await createFloor(owner);room=await createRoom(owner,floor);post=await Chat.create({user:owner._id,room:room._id,floor:floor._id,content:'Private example text'});});
afterEach(()=>{delete process.env.ACTIVITY_NOTIFICATIONS_ENABLED;});
const add=async()=>{await Chat.findOneAndUpdate({_id:post._id},{$push:{replies:{user:actor._id,content:'Private reply text'}}});await drainOnce();return Notification.findOne().lean();};
test('history is saved before a generic push and duplicate worker runs send once',async()=>{const row=await add();const send=jest.fn(async payload=>{expect(await Notification.exists({_id:row._id})).toBeTruthy();expect(JSON.stringify(payload)).not.toMatch(/Private|username|contentSnippet/);expect(payload.url).toContain('activity=');return {accepted:true};});await deliverOnce({send});await deliverOnce({send});expect(send).toHaveBeenCalledTimes(1);expect((await Notification.findById(row._id)).push_state).toBe('sent');});
test('uncertain delivery retries with the same idempotency key, at most three attempts',async()=>{const row=await add();const now=new Date();const send=jest.fn(async()=>{throw Object.assign(new Error('uncertain'),{retryable:true});});for(let i=0;i<4;i++)await deliverOnce({send,now:new Date(now.getTime()+i*61000)});expect(send).toHaveBeenCalledTimes(3);expect(new Set(send.mock.calls.map(x=>x[0].idempotency_key)).size).toBe(1);expect((await Notification.findById(row._id)).push_state).toBe('failed');});
test('read, revoked access and changed settings suppress delivery at send time',async()=>{const row=await add();await Notification.updateOne({_id:row._id},{$set:{read_at:new Date()}});const send=jest.fn();await deliverOnce({send});expect(send).not.toHaveBeenCalled();expect((await Notification.findById(row._id)).push_state).toBe('suppressed');});
test('a transient access check failure is retried, not silently discarded',async()=>{const row=await add();const mock=jest.spyOn(Preference,'findOne').mockImplementationOnce(()=>{throw new Error('database temporarily unavailable');});const send=jest.fn(async()=>({accepted:true}));const now=new Date();await deliverOnce({send,now});expect(send).not.toHaveBeenCalled();expect((await Notification.findById(row._id)).push_state).toBe('sending');mock.mockRestore();await deliverOnce({send,now:new Date(now.getTime()+61000)});expect(send).toHaveBeenCalledTimes(1);});
test('coalescing preserves every history item while sending one push per short window',async()=>{await add();await add();const send=jest.fn(async()=>({accepted:true}));await deliverOnce({send});expect(await Notification.countDocuments()).toBe(2);expect(send).toHaveBeenCalledTimes(1);expect(await Notification.countDocuments({push_state:'suppressed'})).toBe(1);});
test('a crashed final attempt settles as failed instead of remaining leased forever',async()=>{const row=await add();await Notification.updateOne({_id:row._id},{$set:{push_state:'sending',push_attempts:3,push_attempted_at:new Date(0)}});const send=jest.fn();await deliverOnce({send});expect(send).not.toHaveBeenCalled();expect((await Notification.findById(row._id)).push_state).toBe('failed');});
test('turning off personal updates before delivery does not send an already queued push',async()=>{const row=await add();const value=defaults();value.ownUpdates.notify=false;await Preference.create({recipient_key:`user:${owner._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});const send=jest.fn();await deliverOnce({send});expect(send).not.toHaveBeenCalled();expect((await Notification.findById(row._id)).push_state).toBe('suppressed');});

test('history-only creates a durable row without a provider send',async()=>{
  const value=defaults({now:new Date(0)});value.legacyPush=null;value.ownUpdates={...value.ownUpdates,notify:true,timeline:false,push:false};
  await Preference.create({recipient_key:`user:${owner._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});
  const row=await add();const send=jest.fn();await deliverOnce({send});expect(send).not.toHaveBeenCalled();expect(row.reasons).toContain('ownUpdates');expect(row.push_state).toBe('none');
});
test('push can remain enabled while every timeline banner is off',async()=>{
  const value=defaults({now:new Date(0)});value.legacyPush=null;value.timelineEnabled=false;value.ownUpdates={...value.ownUpdates,timeline:false,push:true};
  await Preference.create({recipient_key:`user:${owner._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});
  const row=await add();const send=jest.fn(async()=>({accepted:true}));await deliverOnce({send});expect(send).toHaveBeenCalledTimes(1);expect((await Notification.findById(row._id)).push_state).toBe('sent');
});
test('saved v1 reply-participant push survives while root-owner push stays off',async()=>{
  owner.reply_push_enabled=false;await owner.save();
  const participant=await createUser({role:'Author',push_enabled:true,replied_post_push_enabled:true});
  await Chat.findOneAndUpdate({_id:post._id},{$push:{replies:{user:participant._id,content:'I joined'}}});await drainOnce();
  const value={schemaVersion:1,ownUpdates:{notify:true,push:false,since:new Date(0)},ownReactions:{notify:true,push:false,since:new Date(0)},subscribedThreads:{notify:true,push:false,since:new Date(0)},legacyReplyParticipants:true,legacyOwnSupplement:false};
  await Preference.create({recipient_key:`user:${participant._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});
  await add();const send=jest.fn(async()=>({accepted:true}));await deliverOnce({send});expect(send).toHaveBeenCalledTimes(1);
  expect(await Notification.countDocuments({recipient_key:`user:${participant._id}`,push_state:'sent'})).toBe(1);
  expect(await Notification.countDocuments({recipient_key:`user:${owner._id}`,push_state:'sent'})).toBe(0);
});
test('broad push requires current saved filters and can be cancelled before delivery',async()=>{
  const observer=await createUser({role:'Author',push_enabled:true});
  const value=defaults({now:new Date(0)});value.legacyPush=null;value.roomActivity.push=true;value.roomActivity.timeline=false;value.context={globalQuery:{keyword:'Private example'},columns:[]};
  await Preference.create({recipient_key:`user:${observer._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});
  await add();const row=await Notification.findOne({recipient_key:`user:${observer._id}`});expect(row.push_state).toBe('pending');
  await Preference.updateOne({recipient_key:`user:${observer._id}`},{$set:{'value.context.globalQuery.keyword':'Not matching'}});
  const send=jest.fn(async()=>({accepted:true}));await deliverOnce({send});expect((await Notification.findById(row._id)).push_state).toBe('suppressed');
  expect(await Notification.exists({_id:row._id})).toBeTruthy();
});

test('all scope keeps history and push outside filters; matching push does not send outside filters',async()=>{
  const {parsePatch}=require('../../../services/activity/preferences');
  const observers=await Promise.all([createUser({role:'Author',push_enabled:true}),createUser({role:'Author',push_enabled:true})]);
  for(let i=0;i<observers.length;i++){
    const value=parsePatch({scopes:{roomActivity:{notify:'all',timeline:'matching',push:i===0?'all':'matching'},relatedActivity:{notify:'off',timeline:'off',push:'off'},subscribedThreads:{notify:'off',timeline:'off',push:'off'}},context:{globalQuery:{keyword:'No matching content'},columns:[]}},defaults({now:new Date(0)}),{now:new Date(0)});
    await Preference.create({recipient_key:`user:${observers[i]._id}`,room_id:room._id,version:1,value,created_at:new Date(),updated_at:new Date()});
  }
  await add();
  const allRow=await Notification.findOne({recipient_key:`user:${observers[0]._id}`});
  const matchingRow=await Notification.findOne({recipient_key:`user:${observers[1]._id}`});
  expect(allRow.push_state).toBe('pending');expect(matchingRow.push_state).toBe('none');
  const send=jest.fn(async()=>({accepted:true}));await deliverOnce({send});
  expect((await Notification.findById(allRow._id)).push_state).toBe('sent');
  expect((await Notification.findById(matchingRow._id)).push_state).toBe('none');
  expect(await Notification.countDocuments({_id:{$in:[allRow._id,matchingRow._id]}})).toBe(2);
});
