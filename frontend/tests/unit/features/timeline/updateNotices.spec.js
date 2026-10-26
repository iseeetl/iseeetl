import {describe,it,expect} from 'vitest';
import {normalizeUpdatePreference,diffPostUpdates,noticeVisible,involvedInPost,sanitizeUpdatePreferences,collectUpdateNotices} from '@/features/timeline/updateNotices';
import {roomEmojiChoices,reactionChoicesWithHistory} from '@/features/timeline/roomEmoji';
const room='202610240000000000000002';
const before={_id:'p',room,user:{_id:'author'},content:'original',image_name:'a.png',image_caption:'old',reactions:[],supplementaries:[{_id:'s',content:'old supplement',ai_origin:{kind:'vision',tag_id:'t'}}],replies:[{_id:'r',user:{_id:'me'},content:'reply',reactions:[]}]};
const getters={userId:'me',roomUpdatePreference:()=>({enabled:true,reaction:true}),isSupplementVisible:()=>true};
describe('updates without changing reply order',()=>{
 it('keeps the existing behavior by default and scopes saved preferences by room',()=>{
  expect(normalizeUpdatePreference().enabled).toBe(false);
  const prefs=sanitizeUpdatePreferences({[room]:{enabled:true},bad:{enabled:true}});expect(Object.keys(prefs)).toEqual([room]);expect(prefs[room].scope).toBe('related');
 });
 it('notices alternative/supplement changes and added reactions separately',()=>{
  const after=structuredClone(before);after.image_caption='new';after.supplementaries[0].content='changed';after.replies[0].reactions.push({_id:'reaction',user:'other',type:'いいね'});
  const changes=diffPostUpdates(before,after);expect(changes.map(x=>x.kind)).toEqual(['alternative','supplement','reaction']);expect(changes[2].replyId).toBe('r');expect(before.image_caption).toBe('old');
 });
 it('ignores translation, deletion, initial load and new replies as update notices',()=>{
  const after=structuredClone(before);after.translations=[{lang:'en',content:'translation'}];after.replies.push({_id:'new',content:'new reply'});expect(diffPostUpdates(before,after)).toEqual([]);expect(diffPostUpdates(null,after)).toEqual([]);
 });
 it('tracks involvement through replies and reactions',()=>{expect(involvedInPost(before,getters)).toBe(true);expect(involvedInPost(before,{userId:'unrelated'})).toBe(false);});
 it('suppresses hidden AI, disabled alternative text and unrelated posts',()=>{
  const n={roomId:room,postId:'p',supplementId:'s',kind:'supplement'};
  expect(noticeVisible(n,before,getters)).toBe(true);expect(noticeVisible(n,before,{...getters,isSupplementVisible:()=>false})).toBe(false);
  expect(noticeVisible({...n,supplementId:null,kind:'alternative'},before,{...getters,displayAlternativeText:false})).toBe(false);
  expect(noticeVisible(n,before,{...getters,userId:'other'})).toBe(false);
 });
 it('detects alternative reactions without treating them as reactions to the parent',()=>{
  const after=structuredClone(before);after.alternative_reactions=[{_id:'a',media_kind:'image',user:'other',type:'いいね'}];const n=diffPostUpdates(before,after);expect(n).toHaveLength(1);expect(n[0].media).toBe('image');expect(after.reactions).toEqual([]);
 });
});
describe('one emoji catalog',()=>{
 it('keeps fixed defaults until configured and respects an empty configured list',()=>{expect(roomEmojiChoices(null,'ja')).toHaveLength(5);expect(roomEmojiChoices({configured:true,items:[]},'ja')).toEqual([]);});
 it('retains historical snapshots after a custom candidate was removed',()=>{
  const entries=roomEmojiChoices({configured:true,items:[{_id:'abc',emoji:'💡',label:'なるほど',lang:'ja'}]},'ja');expect(entries[0].type).toBe('room:abc');
  expect(reactionChoicesWithHistory([], [{type:'room:abc',emoji:'💡',label:'なるほど'}])[0]).toMatchObject({retired:true,emoji:'💡'});
 });
});

describe('live update collection',()=>{
 it('queues changes only after a loaded snapshot and excludes own reactions',()=>{
  const commits=[];const ctx={$store:{getters,commit:(name,payload)=>commits.push([name,payload])},timeline:{filters:[{posts:[before]}]}};
  const after=structuredClone(before);after.image_caption='updated';after.reactions=[{_id:'own',user:'me',type:'いいね'},{_id:'other',user:'someone',type:'拍手'}];
  collectUpdateNotices(ctx,after);expect(commits[0][0]).toBe('appendUpdateNotices');expect(commits[0][1].map(n=>n.kind)).toEqual(['alternative','reaction']);expect(commits[0][1].every(n=>!Object.hasOwn(n,'actor'))).toBe(true);
  commits.length=0;ctx.timeline.filters=[];collectUpdateNotices(ctx,after);expect(commits).toEqual([]);
 });
});
