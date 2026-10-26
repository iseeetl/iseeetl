const request = require('supertest');
const { createUserToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const Chat = require('../../../models/Chat');
const KickedUser = require('../../../models/KickedUser');
const routes = require('../../../routes/timeline/postResource.route');
const { snapshot } = require('../../../services/timeline/shared/alternativeText');
const { mergeTimelinePatch } = require('../../../services/timeline/shared/partialMutation');

const emit = jest.fn();
const io = { to: () => ({ emit }) };
let app, owner, actor, floor, room, post, base;
const send = (url, body, user = actor) => request(app).put(url)
  .set('Authorization', `Bearer ${createUserToken(user)}`).send(body);
beforeEach(async () => {
  owner = await createUser({ role: 'Author' }); actor = await createUser({ role: 'Author' }); floor = await createFloor(owner); room = await createRoom(owner, floor, { collaborative_text_editing: true });
  const media = { user: owner._id, content: 'untouched', image_name: 'sample.png', image_caption: 'before', video_name: 'sample.mp4', video_description: 'video', audio_name: 'sample.mp3', audio_description: 'sound' };
  post = await Chat.create({ ...media, floor: floor._id, room: room._id,
    supplementaries: [media], replies: [{ ...media, supplementaries: [media] }] });
  base = `/api/rooms/${room._id}/timeline/posts/${post._id}`;
  app = buildErrorHandledApp({ mounts: [
    { path: '/api', handler: (req, res, next) => { req.io = io; next(); } },
    { path: '/api', handler: routes() },
  ] });
  emit.mockClear();
});
test.each(['post', 'reply', 'supplement', 'replySupplement'])('another room user can edit only text on %s', async (target) => {
  const reply = post.replies[0];
  const item = target === 'post' ? post : target === 'reply' ? reply : target === 'supplement' ? post.supplementaries[0] : reply.supplementaries[0];
  const path = base + (target === 'reply' || target === 'replySupplement' ? `/replies/${reply._id}` : '') +
    (target === 'supplement' || target === 'replySupplement' ? `/supplements/${item._id}` : '');
  const before = await Chat.findById(post._id).lean();
  for (const [kind, field] of [['image', 'image_caption'], ['video', 'video_description'], ['audio', 'audio_description']]) {
    const expected = snapshot(item);
    const response = await send(`${path}/alternative-text`, { kind, text: 'あ'.repeat(2000), expected });
    expect(response.status).toBe(200); item[field] = 'あ'.repeat(2000);
    const stale = await send(`${path}/alternative-text`, { kind, text: 'stale', expected });
    expect(stale.status).toBe(409);
  }
  const after = await Chat.findById(post._id).lean();
  const getTarget = (p) => target === 'post' ? p : target === 'reply' ? p.replies[0] : target === 'supplement' ? p.supplementaries[0] : p.replies[0].supplementaries[0];
  const changed = getTarget(after), original = getTarget(before);
  for (const field of ['image_caption', 'video_description', 'audio_description']) changed[field] = original[field];
  expect(after).toEqual(before);
  expect(emit.mock.calls.every(([event]) => event === 'POST_UPDATE')).toBe(true);
});
test('rejects guests, private-room outsiders, kicked users, wrong room and deleted targets', async () => {
  const body = { kind: 'image', text: 'next', expected: snapshot(post) };
  expect((await request(app).put(`${base}/alternative-text`).send(body)).status).toBe(401);
  room.member_only = true; await room.save();
  expect((await send(`${base}/alternative-text`, body)).status).toBe(403);
  room.member_only = false; await room.save();
  await KickedUser.create({ user: actor._id, floor: floor._id, room: room._id, kicked_by: owner._id });
  expect((await send(`${base}/alternative-text`, body)).status).toBe(403);
  const room2 = await createRoom(owner, floor);
  expect((await send(`${base.replace(String(room._id),String(room2._id))}/alternative-text`, body, owner)).status).toBe(404);
  await Chat.updateOne({ _id: post._id }, { $set: { delete_flg: true } });
  expect((await send(`${base}/alternative-text`, body, owner)).status).toBe(404);
});
test('rejects overflow, unknown keys, media changes and simultaneous writes', async () => {
  const body = { kind: 'image', text: 'next', expected: snapshot(post) };
  for (const payload of [{...body,text:'x'.repeat(2001)}, {...body,content:'hijack'}, {...body,expected:{}}, {...body,kind:'__proto__'}]) {
    const response = await send(`${base}/alternative-text`,payload);
    expect({status:response.status, code:response.body.error?.code}).toEqual({status:400,code:'INVALID_PARAMS'});
  }
  const replies = await Promise.all([send(`${base}/alternative-text`,body),send(`${base}/alternative-text`,{...body,text:'other'})]);
  expect(replies.map((x)=>x.status).sort()).toEqual([200,409]);
  expect(() => mergeTimelinePatch(post, { expected_media_text: { ...snapshot(post), image_caption:'old' } })).toThrow();
  const current = await Chat.findById(post._id);
  await Chat.updateOne({ _id: post._id }, { $set: { image_name:'new.png' } });
  expect((await send(`${base}/alternative-text`, {...body,expected:snapshot(current)})).status).toBe(409);
});

test('room opt-in is required for other users, preserves owner rights and is scoped to the target room', async () => {
  const Room = require('../../../models/Room');
  const body = {kind:'image',text:'updated',expected:snapshot(post)};
  await Room.updateOne({_id:room._id},{$set:{collaborative_text_editing:false}});
  expect((await send(`${base}/alternative-text`,body)).status).toBe(403);
  expect((await send(`${base}/alternative-text`,body,owner)).status).toBe(200);
  const room2=await createRoom(owner,floor);
  expect(room2.collaborative_text_editing).toBe(false);
  const other=await Chat.create({floor:floor._id,room:room2._id,user:owner._id,content:'other',image_name:'other.png'});
  await Room.updateOne({_id:room._id},{$set:{collaborative_text_editing:true}});
  expect((await send(`/api/rooms/${room2._id}/timeline/posts/${other._id}/alternative-text`,{kind:'image',text:'blocked',expected:snapshot(other)})).status).toBe(403);
});

test.each([false,true])('human and AI supplementary text can be corrected without delete/file/author privileges (AI=%s)',async(ai)=>{
  const Room = require('../../../models/Room');
  const target=post.supplementaries[0];
  if(ai){target.meta={analysis_kind:'conversation'};await post.save();}
  const path=`${base}/supplements/${target._id}`;
  const body={text:'corrected',lang:'ja',expected:{content:target.content,lang:target.lang??null}};
  expect((await request(app).put(path+'/text').send(body)).status).toBe(401);
  for(const extra of [{image_name:'bad.png'},{user:String(actor._id)},{meta:null},{delete_flg:true}]){
    expect((await send(path+'/text',{...body,...extra})).status).toBe(400);
  }
  expect((await send(path+'/text',{...body,text:'x'.repeat(2001)})).status).toBe(400);
  await Room.updateOne({_id:room._id},{$set:{collaborative_text_editing:false}});
  expect((await send(path+'/text',body)).status).toBe(403);
  await Room.updateOne({_id:room._id},{$set:{collaborative_text_editing:true}});
  const before=(await Chat.findById(post._id).lean()).supplementaries[0];
  const edited=await send(path+'/text',body);expect(edited.status).toBe(200);
  if(ai)expect(edited.body.supplementaries[0].ai_origin.kind).toBe('conversation');
  const after=(await Chat.findById(post._id).lean()).supplementaries[0];
  expect(after.content).toBe('corrected');expect(after.lang).toBe('ja');
  after.content=before.content;after.lang=before.lang;after.translations=before.translations;expect(after).toEqual(before);
  expect((await send(path+'/text',body)).status).toBe(409);
  const auth={Authorization:`Bearer ${createUserToken(actor)}`};
  expect((await request(app).delete(path).set(auth)).status).toBe(403);
  expect((await request(app).patch(path).set(auth).send({content:'bypass'})).status).toBe(403);
});

test('reply supplementary text supports compare-and-set and rejects deleted parent',async()=>{
  const r=post.replies[0], item=r.supplementaries[0];const path=`${base}/replies/${r._id}/supplements/${item._id}/text`;
  const body={text:'reply supplement',lang:'en',expected:{content:item.content,lang:item.lang??null}};
  const results=await Promise.all([send(path,body),send(path,{...body,text:'concurrent'})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  await Chat.updateOne({_id:post._id},{$set:{'replies.0.delete_flg':true}});
  expect((await send(path,body)).status).toBe(404);
});
