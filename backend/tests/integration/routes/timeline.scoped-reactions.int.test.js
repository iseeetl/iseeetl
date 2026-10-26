const request=require('supertest');
const {createUserToken}=require('../_helpers/auth');
const {buildErrorHandledApp}=require('../_helpers/app');
const {createUser,createFloor,createRoom}=require('../_helpers/models');
const Chat=require('../../../models/Chat');
const Group=require('../../../models/RoomQuickTextGroup');
const Item=require('../../../models/RoomQuickTextItem');
const Room=require('../../../models/Room');
const KickedUser=require('../../../models/KickedUser');
const routes=require('../../../routes/timeline/postResource.route');
const quickRoutes=require('../../../routes/room/roomQuickText.route');
let app,owner,actor,floor,room,post,base,entry;
beforeEach(async()=>{
 owner=await createUser({role:'Editor'});actor=await createUser({role:'Author'});floor=await createFloor(owner);room=await createRoom(owner,floor);
 const media={user:owner._id,content:'original',image_name:'demo.png',image_caption:'description'};
 post=await Chat.create({...media,floor:floor._id,room:room._id,replies:[media],supplementaries:[media]});base=`/api/rooms/${room._id}/timeline/posts/${post._id}`;
 const group=await Group.create({floor:floor._id,room:room._id,user:owner._id,title:'絵文字',lang:'ja',order:1,is_emoji:true});entry=await Item.create({floor:floor._id,room:room._id,group:group._id,label:'なるほど',emoji:'💡',lang:'ja',order:1});
 app=buildErrorHandledApp({mounts:[{path:'/api',handler:(req,res,next)=>{req.io={to:()=>({emit:()=>{}})};next();}},{path:'/api',handler:routes()},{path:'/api',handler:quickRoutes}]});
});
const send=(path,body,user=actor)=>request(app).post(path).set('authorization',`Bearer ${createUserToken(user)}`).send(body);
test.each(['post','reply','supplement'])('keeps alternative reactions separate on %s and preserves saved text',async(target)=>{
 const path=base+(target==='reply'?`/replies/${post.replies[0]._id}`:target==='supplement'?`/supplements/${post.supplementaries[0]._id}`:'');
 const res=await send(path+'/reactions',{type:`room:${entry._id}`,media_kind:'image'});expect(res.status).toBe(200);
 const saved=await Chat.findById(post._id);const item=target==='post'?saved:target==='reply'?saved.replies[0]:saved.supplementaries[0];expect(item.reactions).toHaveLength(0);expect(item.alternative_reactions).toHaveLength(1);expect(item.alternative_reactions[0].emoji).toBe('💡');expect(item.image_caption).toBe('description');expect(item.content).toBe('original');
 expect((await send(path+'/reactions',{type:`room:${entry._id}`,media_kind:'image'})).status).toBe(409);
});
test('removed custom choices remain visible and can be removed by their owner',async()=>{
 const res=await send(base+'/reactions',{type:`room:${entry._id}`});expect(res.status).toBe(200);const reaction=res.body.reactions[0];await Item.deleteOne({_id:entry._id});
 const saved=await Chat.findById(post._id);expect(saved.reactions[0].emoji).toBe('💡');expect((await send(base+'/reactions',{type:`room:${entry._id}`})).status).toBe(400);
 const removed=await request(app).delete(base+'/reactions/'+reaction._id).set('authorization',`Bearer ${createUserToken(actor)}`).send({});expect(removed.status).toBe(200);expect(removed.body.reactions).toHaveLength(0);
});
test('rejects anonymous, wrong-room emoji, missing media, private outsiders and kicked users',async()=>{
 expect((await request(app).post(base+'/reactions').send({type:'いいね'})).status).toBe(401);
 const other=await createRoom(owner,floor);entry.room=other._id;await entry.save();expect((await send(base+'/reactions',{type:`room:${entry._id}`})).status).toBe(400);
 expect((await send(base+'/reactions',{type:'いいね',media_kind:'audio'})).status).toBe(404);
 await Room.updateOne({_id:room._id},{$set:{member_only:true}});expect((await send(base+'/reactions',{type:'いいね'})).status).toBe(401);
 await Room.updateOne({_id:room._id},{$set:{member_only:false}});await KickedUser.create({user:actor._id,floor:floor._id,room:room._id,kicked_by:owner._id});expect((await send(base+'/reactions',{type:'いいね'})).status).toBe(401);
});
test('room emoji configuration requires existing management permission and validates glyph input',async()=>{
 const path=`/api/rooms/${room._id}/quick-text/groups`;
 expect((await send(path,{title:'Emoji',lang:'en',is_emoji:true})).status).toBe(403);
 const res=await send(path,{title:'Emoji',lang:'en',is_emoji:true},owner);expect(res.status).toBe(200);expect(res.body.is_emoji).toBe(true);
 expect((await send(path+'/'+res.body._id+'/items',{label:'Thanks',emoji:'<script>',lang:'en'},owner)).status).toBe(400);
 const item=await send(path+'/'+res.body._id+'/items',{label:'Thanks',emoji:'🙏',lang:'en'},owner);expect(item.status).toBe(200);expect(item.body.emoji).toBe('🙏');
});

test('guest reaction is authenticated, scoped and removable only by the same guest',async()=>{
 const {buildAccessToken}=require('../../../services/guestAuth.service');
 const token=buildAccessToken('local-guest-one');
 const res=await request(app).post(base+'/reactions').set('x-guest-token',token).send({type:`room:${entry._id}`,media_kind:'image'});
 expect(res.status).toBe(200);const reaction=res.body.alternative_reactions[0];
 const denied=await request(app).delete(base+'/reactions/'+reaction._id).set('x-guest-token',buildAccessToken('local-guest-two')).send({media_kind:'image'});expect(denied.status).toBe(403);
 const removed=await request(app).delete(base+'/reactions/'+reaction._id).set('x-guest-token',token).send({media_kind:'image'});expect(removed.status).toBe(200);
});
test('emoji-only guest posts use the room catalog and normal text remains disallowed',async()=>{
 const {containsOnlyAllowedEmojis}=require('../../../services/timeline/shared/guestRules');
 expect(await containsOnlyAllowedEmojis('💡💡',room._id)).toBe(true);
 expect(await containsOnlyAllowedEmojis('💡 comment',room._id)).toBe(false);
 expect(await containsOnlyAllowedEmojis('👍',room._id)).toBe(false);
 expect(containsOnlyAllowedEmojis('👍')).toBe(true);
});
