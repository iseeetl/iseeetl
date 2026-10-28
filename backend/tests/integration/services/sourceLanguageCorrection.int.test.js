jest.mock('../../../services/translation.service', () => ({ translateContent: jest.fn(), translateGuestContent: jest.fn(), getFailedTranslationLanguages: () => [] }));
const request = require('supertest');
const { createUserToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const Chat = require('../../../models/Chat');
const routes = require('../../../routes/timeline/postResource.route');
const core = require('../../../services/translation.service');
const translate = require('../../../services/timeline/timelineTranslation.service');
const emit = jest.fn(); const io = { to: () => ({ emit }) };
let owner, other, floor, room, post, app, base;
beforeEach(async () => {
  owner=await createUser({role:'Author'});other=await createUser({role:'Author'});
  floor=await createFloor(owner);room=await createRoom(owner,floor,{collaborative_text_editing:true});
  const original={user:owner._id,content:'Hello.',lang:'ja',translations:[{lang:'en',content:'stale'}]};
  post=await Chat.create({...original,floor:floor._id,room:room._id,supplementaries:[{...original,meta:{analysis_kind:'speech'}}],replies:[{...original,supplementaries:[original]}]});
  base=`/api/rooms/${room._id}/timeline/posts/${post._id}`;
  app=buildErrorHandledApp({mounts:[{path:'/api',handler:(req,res,next)=>{req.io=io;next();}},{path:'/api',handler:routes()}]});
  emit.mockClear();
});
test.each(['post','reply'])('%s: language-only correction clears old translations and preserves text/AI supplements',async kind=>{
  const item=kind==='post'?post:post.replies[0],path=base+(kind==='post'?'':`/replies/${item._id}`);
  expect((await request(app).patch(path).send({lang:'en'})).status).toBe(401);
  expect((await request(app).patch(path).set('Authorization',`Bearer ${createUserToken(other)}`).send({lang:'en'})).status).toBe(403);
  const result=await request(app).patch(path).set('Authorization',`Bearer ${createUserToken(owner)}`).send({lang:'en'});
  expect(result.status).toBe(200);
  const saved=await Chat.findById(post._id);const current=kind==='post'?saved:saved.replies[0];
  expect(current.lang).toBe('en');expect(current.content).toBe('Hello.');expect(current.translations).toHaveLength(0);
  expect(current.supplementaries.map(x=>x.toObject())).toEqual(item.supplementaries.map(x=>x.toObject()));
});
test('AI transcript language can be corrected through the existing collaborative text permission',async()=>{
  const item=post.supplementaries[0];const before=item.toObject();
  const result=await request(app).put(`${base}/supplements/${item._id}/text`).set('Authorization',`Bearer ${createUserToken(other)}`).send({text:item.content,lang:'en',expected:{content:item.content,lang:'ja'}});
  expect(result.status).toBe(200);const current=(await Chat.findById(post._id)).supplementaries[0].toObject();
  expect(current.lang).toBe('en');expect(current.translations).toEqual([]);
  current.lang=before.lang;current.translations=before.translations;expect(current).toEqual(before);
});
test.each(['post','guestPost','reply','guestReply','supplement','replySupplement'])('%s: a late translation cannot overwrite a corrected language',async kind=>{
  let release; const delayed=new Promise(resolve=>{release=resolve;});core.translateContent.mockReturnValue(delayed);core.translateGuestContent.mockReturnValue(delayed);
  const r=post.replies[0];const item=kind==='supplement'?post.supplementaries[0]:kind==='replySupplement'?r.supplementaries[0]:kind.includes('Reply')||kind==='reply'?r:post;
  const names={post:'translateMainContentIfNeeded',guestPost:'translateGuestMainContentIfNeeded',reply:'translateReplyIfNeeded',guestReply:'translateGuestReplyIfNeeded',supplement:'translateSupplementIfNeeded',replySupplement:'translateReplySupplementIfNeeded'};
  const job=translate[names[kind]]({chatId:post._id,replyId:r._id,supplementId:item._id,reply:r,content:'Hello.',lang:'ja',targetLangs:['en'],userId:owner._id,guestId:'test',io});
  const prefix=kind==='post'||kind==='guestPost'?'':kind==='reply'||kind==='guestReply'?'replies.0.':kind==='supplement'?'supplementaries.0.':'replies.0.supplementaries.0.';
  await Chat.updateOne({_id:post._id},{$set:{[prefix+'lang']:'en',[prefix+'translations']:[]}});
  release([{lang:'en',content:'stale output'}]);await job;
  const saved=await Chat.findById(post._id);const current=prefix===''?saved:prefix==='replies.0.'?saved.replies[0]:prefix==='supplementaries.0.'?saved.supplementaries[0]:saved.replies[0].supplementaries[0];
  expect(current.lang).toBe('en');expect(current.translations).toHaveLength(0);expect(emit).not.toHaveBeenCalled();
});
