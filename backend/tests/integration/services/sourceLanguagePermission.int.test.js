jest.mock('../../../services/translation.service', () => ({ translateContent: jest.fn(), getFailedTranslationLanguages: () => [] }));
jest.mock('../../../services/analysis.service', () => ({ runPostAnalyses: jest.fn(), runReplyAnalyses: jest.fn() }));
const request = require('supertest');
const { createUserToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const Chat = require('../../../models/Chat');
const KickedUser = require('../../../models/KickedUser');
const routes = require('../../../routes/timeline/postResource.route');
const translation = require('../../../services/translation.service');
const analysis = require('../../../services/analysis.service');
const { drainBackgroundTasks } = require('../../../services/backgroundTaskRunner');
const flags = require('../../../config/featureFlags');
const emit = jest.fn(); const io = { to: () => ({ emit }) };
let owner, reader, floor, room, post, app, base;
const expected = { content: 'Hello.', lang: 'ja' };
beforeEach(async () => {
  owner = await createUser({role:'Author'}); reader = await createUser({role:'Author'});
  floor = await createFloor(owner, {target_langs:['ja','en']}); room = await createRoom(owner, floor, {collaborative_text_editing:false});
  const original = {user:owner._id,content:expected.content,lang:expected.lang,translations:[{lang:'en',content:'stale'}]};
  post = await Chat.create({...original, floor:floor._id, room:room._id,
    supplementaries:[{...original,meta:{analysis_kind:'speech'}}],replies:[{...original,supplementaries:[original]}]});
  base = `/api/rooms/${room._id}/timeline/posts/${post._id}`;
  app = buildErrorHandledApp({mounts:[{path:'/api',handler:(req,res,next)=>{req.io=io;next();}},{path:'/api',handler:routes()}]});
  translation.translateContent.mockResolvedValue([{lang:'ja',content:'こんにちは。'}]);
});
afterEach(async () => { await drainBackgroundTasks(); jest.restoreAllMocks(); });
function target(kind, value = post) {
  return kind === 'post' ? value : kind === 'reply' ? value.replies[0]
    : kind === 'supplement' ? value.supplementaries[0] : value.replies[0].supplementaries[0];
}
function url(kind) {
  return base + (kind === 'reply' || kind === 'replySupplement' ? `/replies/${post.replies[0]._id}` : '') +
    (kind === 'supplement' || kind === 'replySupplement' ? `/supplements/${target(kind)._id}` : '') + '/source-language';
}
const send = (kind, payload = {lang:'en',expected}, user = reader) => request(app).put(url(kind))
  .set('Authorization',`Bearer ${createUserToken(user)}`).send(payload);

test.each(['post','reply','supplement','replySupplement'])('%s: ordinary user can correct only language with collaborative editing off', async kind => {
  const before = target(kind).toObject();
  const response = await send(kind); expect(response.status).toBe(200);
  const saved = target(kind, await Chat.findById(post._id)).toObject();
  expect(saved.lang).toBe('en'); expect(saved.translations).toEqual([]);
  if (kind === 'post' || kind === 'reply') {
    expect(saved.analysis_source_revision).toBe((before.analysis_source_revision ?? 0) + 1);
    saved.analysis_source_revision = before.analysis_source_revision;
  }
  saved.lang = before.lang; saved.translations = before.translations; expect(saved).toEqual(before);
  expect(analysis.runPostAnalyses).not.toHaveBeenCalled(); expect(analysis.runReplyAnalyses).not.toHaveBeenCalled();
});
test.each(['post','reply','supplement','replySupplement'])('%s: guest cannot correct language', async kind => {
  expect((await request(app).put(url(kind)).send({lang:'en',expected})).status).toBe(401);
});
test.each(['post','reply','supplement','replySupplement'])('%s: new translations are built from the corrected language',async kind=>{
  jest.spyOn(flags,'isGoogleTranslateEnabled').mockReturnValue(true);
  expect((await send(kind)).status).toBe(200); await drainBackgroundTasks();
  expect(translation.translateContent).toHaveBeenCalledWith(String(reader._id),'Hello.','en',['ja','en']);
  expect(target(kind,await Chat.findById(post._id)).translations.map(x=>({lang:x.lang,content:x.content})))
    .toEqual([{lang:'ja',content:'こんにちは。'}]);
});
test.each([{lang:'en',expected,content:'changed'}, {lang:'en',expected,user:'changed'},
  {lang:'xx',expected}, {lang:'en',expected:{lang:'ja'}}, {lang:'en',expected:{...expected,extra:true}}])('rejects extra fields or invalid language/snapshot: %j',async payload=>{
  const response = await send('post',payload);
  expect({status:response.status, error:response.body.error}).toMatchObject({status:400});
  expect((await Chat.findById(post._id)).lang).toBe('ja');
});
test('existing full-text edit remains forbidden to another ordinary user',async()=>{
  const auth=`Bearer ${createUserToken(reader)}`;
  expect((await request(app).patch(base).set('Authorization',auth).send({content:'changed'})).status).toBe(403);
  expect((await request(app).patch(`${base}/replies/${post.replies[0]._id}`).set('Authorization',auth).send({content:'changed'})).status).toBe(403);
  expect((await request(app).put(`${base}/supplements/${post.supplementaries[0]._id}/text`).set('Authorization',auth).send({text:'changed',lang:'en',expected})).status).toBe(403);
});
test('stale editor receives a conflict without overwriting the newer value',async()=>{
  await Chat.updateOne({_id:post._id},{$set:{lang:'fr',translations:[{lang:'ja',content:'newer'}]}});
  expect((await send('post')).status).toBe(409);
  expect((await Chat.findById(post._id)).lang).toBe('fr');
});
test('re-selecting the current language retains translations and does not rerun translation',async()=>{
  jest.spyOn(flags,'isGoogleTranslateEnabled').mockReturnValue(true);
  expect((await send('post',{lang:'ja',expected})).status).toBe(200); await drainBackgroundTasks();
  expect((await Chat.findById(post._id)).translations[0].content).toBe('stale');
  expect(translation.translateContent).not.toHaveBeenCalled();
});
test('room access is required for a members-only room',async()=>{
  await room.updateOne({$set:{member_only:true}});
  expect((await send('post')).status).toBe(403);
});
test('a kicked user cannot change language',async()=>{
  await KickedUser.create({floor:floor._id,room:room._id,user:reader._id,kicked_by:owner._id});
  expect((await send('post')).status).toBe(403);
});
test('a post from a different room cannot be addressed through an open room',async()=>{
  const another=await createRoom(owner,floor);
  const wrong=url('post').replace(String(room._id),String(another._id));
  expect((await request(app).put(wrong).set('Authorization',`Bearer ${createUserToken(reader)}`).send({lang:'en',expected})).status).toBe(404);
});
test('a deleted parent reply blocks editing its supplement',async()=>{
  await Chat.updateOne({_id:post._id},{$set:{'replies.0.delete_flg':true}});
  expect((await send('replySupplement')).status).toBe(404);
});
test('unknown language and a guest-authored post can be corrected by a signed-in reader',async()=>{
  await Chat.updateOne({_id:post._id},{$set:{user:null,lang:null}});
  expect((await send('post',{lang:'en',expected:{content:'Hello.',lang:null}})).status).toBe(200);
  expect((await Chat.findById(post._id)).user).toBeNull();
});

test('invalid source revision cannot be incremented',async()=>{
  await Chat.collection.updateOne({_id:post._id},{$set:{analysis_source_revision:Number.MAX_SAFE_INTEGER}});
  expect((await send('post')).status).toBe(400);
  expect((await Chat.findById(post._id)).lang).toBe('ja');
});
