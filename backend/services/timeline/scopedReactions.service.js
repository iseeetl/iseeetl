const AppError = require('../../utils/appError');
const Chat = require('../../models/Chat');
const RoomQuickTextGroup = require('../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../models/RoomQuickTextItem');
const { authorizeUserFromChat, authorizeGuestFromChat, updateChatAndPopulate, canDeleteByRole } = require('./shared/reactionHelpers');
const { publishSocketEvent } = require('../../socket/publication');
const standard = {'いいね':'👍','超いいね':'💖','拍手':'👏','笑顔':'😊','びっくり':'😲'};
const invalid = () => { throw new AppError({code:'INVALID_PARAMS'}); };
async function change(params, body, identity, guest, io, remove = false) {
 for(const key of ['room_id','post_id','reply_id','supplement_id','reaction_id']) {
  if((['room_id','post_id'].includes(key)||params[key]!==undefined)&& !/^[a-f0-9]{24}$/i.test(params[key]||''))invalid();
 }
 if(!identity?.user_id&&!guest?.id)throw new AppError({code:'TOKEN_INVALID'});
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['type','media_kind','guest_name'].includes(k)))invalid();
 const kind=body.media_kind || null;
 if(kind&&!['image','video','audio'].includes(kind))invalid();
 if(body.guest_name!==undefined&&(typeof body.guest_name!=='string'||body.guest_name.length>20))invalid();
 const chat=await Chat.findOne({_id:params.post_id,room:params.room_id,delete_flg:false});
 if(!chat)throw new AppError({code:'NOT_FOUND'});
 const access=identity?.user_id?await authorizeUserFromChat(chat,identity):await authorizeGuestFromChat(chat);
 let item=chat,prefix='';const query={_id:chat._id,room:params.room_id,delete_flg:false};
 if(params.reply_id){const i=chat.replies.findIndex(x=>String(x._id)===params.reply_id&&!x.delete_flg);if(i<0)throw new AppError({code:'NOT_FOUND'});item=chat.replies[i];prefix=`replies.${i}.`;query[`${prefix}_id`]=item._id;query[`${prefix}delete_flg`]=false;}
 if(params.supplement_id){const i=item.supplementaries.findIndex(x=>String(x._id)===params.supplement_id&&!x.delete_flg);if(i<0)throw new AppError({code:'NOT_FOUND'});item=item.supplementaries[i];prefix+=`supplementaries.${i}.`;query[`${prefix}_id`]=item._id;query[`${prefix}delete_flg`]=false;}
 if(kind&&!item[`${kind}_name`])throw new AppError({code:'NOT_FOUND'});
 const field=kind?'alternative_reactions':'reactions';const list=item[field]||[];const path=prefix+field;
 const owner=identity?.user_id?{user:identity.user_id}:{guest_id:guest.id};
 let update;
 if(remove){
  const reaction=list.find(x=>String(x._id)===params.reaction_id&&(!kind||x.media_kind===kind));
  if(!reaction)throw new AppError({code:'NOT_FOUND'});
  const owned=identity?.user_id?String(reaction.user)===identity.user_id:reaction.guest_id===guest.id;
  const manager=identity?.user_id&&canDeleteByRole({role:identity.user_role,floor:access.foundFloor,floorMember:access.foundFloorMember,userId:identity.user_id});
  if(!owned&&!manager)throw new AppError({code:'FORBIDDEN'});
  update={$pull:{[path]:{_id:params.reaction_id}}};
 }else{
  const type=body.type;if(typeof type!=='string')invalid();let definition;
  if(Object.hasOwn(standard,type))definition={emoji:standard[type],label:type};
  else if(/^room:[a-f0-9]{24}$/i.test(type)){
   const entry=await RoomQuickTextItem.findOne({_id:type.slice(5),room:params.room_id}).lean();
   if(!entry?.emoji||!await RoomQuickTextGroup.exists({_id:entry.group,room:params.room_id,is_emoji:true}))invalid();
   definition={emoji:entry.emoji,label:entry.label};
  }else invalid();
  const duplicate={...owner,type,...(kind?{media_kind:kind}:{})};
  if(list.some(x=>x.type===type&&(!kind||x.media_kind===kind)&&(identity?.user_id?String(x.user)===identity.user_id:x.guest_id===guest.id)))throw new AppError({code:'CONFLICT'});
  query[path]={$not:{$elemMatch:duplicate}};
  if(kind)query[`${prefix}${kind}_name`]=item[`${kind}_name`];
  update={$push:{[path]:{...owner,type,...definition,media_kind:kind,guest_name:identity?.user_id?null:body.guest_name||null}}};
 }
 const result=await updateChatAndPopulate({query,update});
 await publishSocketEvent('POST_UPDATE',()=>io.to(String(params.room_id)).emit('POST_UPDATE',result));
 return result;
}
module.exports={change};
