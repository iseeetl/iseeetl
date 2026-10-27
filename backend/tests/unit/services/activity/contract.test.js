const { actorKey, threadAuthors, involved, ownPushAllowed, planNotification } = require('../../../../services/activity/contract');
const { defaults } = require('../../../../services/activity/preferences');
const before=new Date('2026-01-01'),now=new Date('2026-02-01');
const prefs=()=>{const p=defaults({now:before});p.legacyPush=null;p.ownUpdates.push=true;return p;};
const chat={user:'root',replies:[{user:'one',created_at:before},{user:'two',created_at:before}],reactions:[{user:'reactor',created_at:before}]};
const event={_id:'event',type:'reply',actor_key:'user:two',owner_key:'user:root',occurred_at:now};
const input=()=>({event,recipientKey:'user:one',preferences:prefs(),chat,authoredThread:true});
test('registered and guest identities never collide',()=>{expect(actorKey({user:{_id:'one'}})).toBe('user:one');expect(actorKey({guest_id:'one'})).toBe('guest:one');});
test('all flat replies count as authored posts in the same conversation',()=>{
  expect([...threadAuthors(chat,event)]).toEqual(['user:root','user:one','user:two']);
  expect(planNotification(input()).reasons).toEqual(['ownUpdates']);
});
test.each(['reply','alternative','supplement'])('%s in a joined conversation belongs to own updates',type=>{expect(planNotification({...input(),event:{...event,type}}).reasons).toEqual(['ownUpdates']);});
test('a different persons reaction is not a reaction to my post',()=>{
  expect(planNotification({...input(),event:{...event,type:'reaction'}})).toBeNull();
  expect(planNotification({...input(),event:{...event,type:'reaction',owner_key:'user:one'}}).reasons).toEqual(['ownReactions']);
});
test('deleted or later authorship does not retrospectively add recipients',()=>{
  expect([...threadAuthors({user:'root',replies:[{user:'deleted',delete_flg:true},{user:'later',created_at:new Date('2026-03-01')},{guest_id:'guest',created_at:before}]},event)]).toEqual(['user:root','guest:guest']);
});
test('related includes reactions and explanations without making them authored replies',()=>{
  expect(involved(chat,'user:reactor',event)).toBe(true);expect(threadAuthors(chat,event).has('user:reactor')).toBe(false);
});
test('overlapping causes produce one plan, with independent channels',()=>{
  const p=prefs();p.relatedActivity={...p.relatedActivity,notify:true};p.ownUpdates.timeline=false;
  const plan=planNotification({...input(),preferences:p,subscribed:true,contextMatched:true,related:true,filterMatched:true});
  expect(plan.reasons).toEqual(['ownUpdates','subscribedThreads','roomActivity','relatedActivity','savedFilter']);expect(plan.pushEligible).toBe(true);
});
test('broad context is required, and cannot override a history opt-out',()=>{
  const p=prefs();p.ownUpdates.notify=false;
  expect(planNotification({...input(),preferences:p,contextMatched:false})).toBeNull();
  expect(planNotification({...input(),preferences:p,contextMatched:true}).reasons).toEqual(['roomActivity']);
});
test('legacy push retains root and participant differences until explicitly changed',()=>{
  const p=defaults({legacyUser:{push_enabled:true,reply_push_enabled:false,replied_post_push_enabled:true},now:before});
  expect(ownPushAllowed(event,'user:root',p,chat)).toBe(false);expect(ownPushAllowed(event,'user:one',p,chat)).toBe(true);
  expect(ownPushAllowed({...event,type:'alternative'},'user:one',p,chat)).toBe(false);
});
test('hidden AI retains history but suppresses push; self and unauthorized are excluded',()=>{
  expect(planNotification({...input(),visible:false})).toMatchObject({suppressed:true,pushEligible:false});
  expect(planNotification({...input(),recipientKey:'user:two'})).toBeNull();expect(planNotification({...input(),authorized:false})).toBeNull();
});

test.each([true,false])('all-scope history is recorded regardless of current filter match %s',matched=>{
  const p=require('../../../../services/activity/preferences').parsePatch({scopes:{roomActivity:{notify:'all',timeline:'matching',push:'off'},relatedActivity:{notify:'all',timeline:'all',push:'all'},subscribedThreads:{notify:'off',timeline:'off',push:'off'}}},prefs(),{now:before});
  const plan=planNotification({...input(),preferences:p,roomConfigured:true,contextMatched:matched,related:true});
  expect(plan.reasons).toEqual(['roomActivity','relatedActivity']);expect(plan.pushEligible).toBe(true);
});
test('matching push uses filters while all history remains, including a bell conversation',()=>{
  const p=require('../../../../services/activity/preferences').parsePatch({scopes:{roomActivity:{notify:'off',timeline:'off',push:'off'},relatedActivity:{notify:'off',timeline:'off',push:'off'},subscribedThreads:{notify:'all',timeline:'matching',push:'matching'}}},prefs(),{now:before});
  for(const match of [true,false]){const plan=planNotification({...input(),preferences:p,roomConfigured:true,contextMatched:match,subscribed:true});expect(plan.reasons).toEqual(['subscribedThreads']);expect(plan.pushEligible).toBe(match);}
});
