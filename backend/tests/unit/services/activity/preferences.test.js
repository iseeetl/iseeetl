const { defaults, normalize, parsePatch, eventVisible, channelEnabled } = require('../../../../services/activity/preferences');
const before = new Date('2026-01-01T00:00:00Z'), now = new Date('2026-02-01T00:00:00Z');
test('default history and timeline are on; new push is off', () => {
  const p = defaults({ now: before });
  expect(p.schemaVersion).toBe(3); expect(p.roomActivity).toMatchObject({ notify:true,timeline:true,push:false });
  expect(p.timelineEnabled).toBe(true);
  for (const key of ['roomActivity','relatedActivity','ownUpdates','ownReactions','subscribedThreads']) expect(p[key].push).toBe(false);
});
test('legacy participant push is visible in the unified row without broadening the delivery guard', () => {
  const p=defaults({legacyUser:{push_enabled:true,reply_push_enabled:false,replied_post_push_enabled:true}});
  expect(p.ownUpdates.push).toBe(true);expect(p.legacyPush).toEqual({ownReply:false,participantReply:true,ownSupplement:true});
  expect(p.subscribedThreads.push).toBe(false);
});
test.each([{ownUpdates:{notify:false,timeline:true,push:false}},{ownUpdates:{notify:false,push:true}},{ownUpdates:{notify:true,push:true}},{owner:'other'},{visibility:{alternative:true,supplement:true,ai:true,hiddenAITagIds:['bad']}},{context:{globalQuery:{$where:'x'},columns:[]}}])('guest rejects invalid or escalating patch %j', patch => {
  expect(()=>parsePatch(patch,defaults(),{guest:true})).toThrow();
});
test('history-only is independent from banner and push',()=>{
  const p=parsePatch({ownUpdates:{notify:true,timeline:false,push:false}},defaults({now:before}),{now});
  expect(channelEnabled(p.ownUpdates,'notify',{occurred_at:now})).toBe(true);
  expect(channelEnabled(p.ownUpdates,'timeline',{occurred_at:now})).toBe(false);
});
test('master banner off does not disable saved history or push',()=>{
  const p=parsePatch({timelineEnabled:false,ownUpdates:{notify:true,timeline:true,push:true}},defaults({now:before}),{now});
  expect(p.timelineEnabled).toBe(false);expect(p.ownUpdates.push).toBe(true);expect(p.ownUpdates.notify).toBe(true);
});
test('re-enabling channels sets independent boundaries and does not replay backlog',()=>{
  const p=defaults({now:before});p.ownUpdates.notify=false;p.ownUpdates.timeline=false;
  const result=parsePatch({ownUpdates:{notify:true,timeline:true,push:true}},p,{now});
  for(const channel of ['notify','timeline','push'])expect(channelEnabled(result.ownUpdates,channel,{occurred_at:before})).toBe(false);
  expect(result.ownUpdates.since).toEqual(now);expect(p.ownUpdates.since).toEqual(before);
});
test('v1 migration retains row choices and does not overwrite source',()=>{
  const old={schemaVersion:1,ownUpdates:{notify:true,push:false,since:before},roomActivity:{enabled:true,scope:'related',reaction:false},legacyReplyParticipants:true,legacyOwnSupplement:false};
  const p=normalize(old,{now:before});
  expect(p.roomActivity.timeline).toBe(false);expect(p.relatedActivity.timeline).toBe(true);expect(p.updateTypes.reaction).toBe(false);
  expect(p.legacyPush).toEqual({ownReply:false,participantReply:true,ownSupplement:false});expect(old.schemaVersion).toBe(1);
});
test('editing timeline channel or visibility preserves legacy push; explicit push off replaces it',()=>{
  const p=defaults({legacyUser:{push_enabled:true,reply_push_enabled:false},now:before});
  expect(parsePatch({visibility:p.visibility},p).legacyPush).toEqual(p.legacyPush);
  expect(parsePatch({ownUpdates:{notify:true,timeline:false,push:true}},p).legacyPush).toEqual(p.legacyPush);
  expect(parsePatch({ownUpdates:{notify:true,timeline:false,push:false}},p).legacyPush).toBe(null);
});
test('AI hide does not hide human explanation',()=>{
  const p=defaults();p.visibility.ai=false;
  expect(eventVisible({supplement_id:'s',ai_kind:'vision'},p)).toBe(false);
  expect(eventVisible({supplement_id:'s'},p)).toBe(true);
});
test('context is bounded and accepts the same filter contract as timeline search',()=>{
  const context={globalQuery:{keyword:'demo'},columns:[null,{tags:['tag'],filterMode:'exclude'}]};
  const p=parsePatch({context},defaults({now:before}),{now});expect(p.context).toEqual(context);expect(p.contextSince).toEqual(now);
  expect(()=>parsePatch({context:{globalQuery:null,columns:Array(11).fill(null)}},p)).toThrow();
});

const allScopes = () => ({ roomActivity:{notify:'all',timeline:'matching',push:'off'}, relatedActivity:{notify:'off',timeline:'off',push:'off'}, subscribedThreads:{notify:'all',timeline:'matching',push:'off'} });
test('explicit three-target save replaces old personal rules, sync-only preserves them',()=>{
  const p=defaults({now:before}); const sync=parsePatch({context:{globalQuery:null,columns:[null]}},p,{now});
  expect(sync.preserveOwnNotifications).toBe(true);
  const next=parsePatch({scopes:allScopes()},p,{now});expect(next.preserveOwnNotifications).toBe(false);expect(next.ownUpdates.notify).toBe(false);
  expect(next.scopes.roomActivity.notify).toBe('all');expect(next.scopes.roomActivity.timeline).toBe('matching');
});
test.each(['timeline','push'])('notification %s cannot be wider than saved history',channel=>{
  const scopes=allScopes();scopes.roomActivity.notify='matching';scopes.roomActivity[channel]='all';
  expect(()=>parsePatch({scopes},defaults())).toThrow();
});
test('guest cannot enable scoped push, and modes/targets are validated',()=>{
  const scopes=allScopes();scopes.roomActivity.push='matching';expect(()=>parsePatch({scopes},defaults(),{guest:true})).toThrow();
  scopes.roomActivity.push='unknown';expect(()=>parsePatch({scopes},defaults())).toThrow();
  expect(()=>parsePatch({scopes:{roomActivity:allScopes().roomActivity}},defaults())).toThrow();
});
test('widening scope begins at save time and does not backfill old push',()=>{
  const scopes=allScopes(),p=parsePatch({scopes},defaults({now:before}),{now:before});scopes.roomActivity.push='all';
  const next=parsePatch({scopes},p,{now});expect(next.roomActivity.pushSince).toEqual(now);expect(channelEnabled(next.roomActivity,'push',{occurred_at:before})).toBe(false);
});
