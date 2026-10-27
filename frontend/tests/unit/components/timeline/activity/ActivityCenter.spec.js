import { shallowMount, flushPromises } from '@vue/test-utils';
import Center from '@/components/timeline/activity/ActivityCenter.vue';
import api from '@/api/activity';
import { cursorKey, readCursor, saveCursor, visibleEntry, timelineEnabled } from '@/components/timeline/activity/activityState';
vi.mock('@/api/activity', () => ({ default: { capability:vi.fn(),preferences:vi.fn(),savePreferences:vi.fn(),subscriptions:vi.fn(),list:vi.fn(),target:vi.fn(),markRead:vi.fn(),subscribe:vi.fn() } }));
const prefs=()=>({schemaVersion:2,historyStart:'2026-01-01T00:00:00Z',timelineEnabled:true,context:{globalQuery:{},columns:[]},updateTypes:{reply:true,alternative:true,supplement:true,reaction:true},ownUpdates:{notify:true,timeline:true,push:false},ownReactions:{notify:true,timeline:true,push:false},subscribedThreads:{notify:true,timeline:true,push:false},roomActivity:{notify:true,timeline:true,push:false},relatedActivity:{notify:false,timeline:false,push:false},visibility:{alternative:true,supplement:true,ai:true,hiddenAITagIds:[]}});
const make=()=>shallowMount(Center,{props:{roomId:'a'.repeat(24),roomTitle:'Room',tags:[],filters:[],globalQuery:{}},global:{mocks:{$store:{state:{},getters:{guestId:'guest',userIsLogin:false,displayAlternativeText:true,displaySupplement:true,roomAIVisibility:()=>({mode:'all'})}},$t:k=>k,$i18n:{locale:'ja'},$route:{query:{}}},stubs:{UiDialog:{template:'<div><slot/><slot name="actions"/></div>'},ActivityTarget:true}}});
beforeEach(()=>{localStorage.clear();api.capability.mockResolvedValue({data:{enabled:true}});api.preferences.mockResolvedValue({data:{version:1,value:prefs()}});api.subscriptions.mockResolvedValue({data:{postIds:[]}});api.list.mockResolvedValue({data:{entries:[],latestCursor:'baseline',nextCursor:null}});api.target.mockResolvedValue({data:{available:true,post:{_id:'post'}}});api.markRead.mockImplementation(async(room,ids)=>({data:{readIds:ids}}));});
it('keeps history and read state separate from banner dismissal',async()=>{const w=make();await flushPromises();w.vm.pending=true;w.vm.entries=[{id:'one',read:false}];w.vm.dismissBanner();expect(w.vm.pending).toBe(false);expect(w.vm.entries[0].read).toBe(false);expect(api.markRead).not.toHaveBeenCalled();w.unmount();});
it('marks the displayed IDs without consuming a newly arrived entry',async()=>{const w=make();await flushPromises();let finish;api.markRead.mockImplementation(()=>new Promise(resolve=>finish=resolve));w.vm.entries=[{id:'one',read:false}];const task=w.vm.markDisplayed();w.vm.entries.push({id:'two',read:false});finish({data:{readIds:['one']}});await task;expect(w.vm.entries.map(x=>x.read)).toEqual([true,false]);w.unmount();});
it('does not apply an old target response after a room switch',async()=>{const w=make();await flushPromises();let finish;api.target.mockImplementation(()=>new Promise(resolve=>finish=resolve));const task=w.vm.openTarget({id:'one'});await w.setProps({roomId:'b'.repeat(24)});finish({data:{available:true,post:{_id:'old'}}});await task;expect(w.vm.target).toBe(null);w.unmount();});
it('personal notifications work even with room-wide notices off',async()=>{const w=make();await flushPromises();const value=prefs();value.roomActivity.timeline=false;api.preferences.mockResolvedValue({data:{version:2,value}});api.list.mockImplementation(async(room,options)=>({data:{entries:options.view==='personal'?[{id:'one',type:'reply',available:true,read:false,ownAction:false,reasons:['ownUpdates']}]:[],latestCursor:'next',nextCursor:null}}));w.vm.exactTargetVisible=()=>false;await w.vm.poll();expect(w.vm.pending).toBe(true);expect(w.vm.pendingView).toBe('personal');w.unmount();});
it('keeps existing room settings when migrating, without enabling push',async()=>{const w=make();await flushPromises();w.vm.draft=prefs();w.vm.draft.ownUpdates.notify=false;w.vm.draft.ownUpdates.push=true;w.vm.disableDependent('ownUpdates');expect(w.vm.draft.ownUpdates.push).toBe(false);w.unmount();});
it('persists only account/room-specific catch-up cursors',()=>{const a=cursorKey('one','room','room'),b=cursorKey('two','room','room');saveCursor(a,'cursor');expect(readCursor(a)).toBe('cursor');expect(readCursor(b)).toBe(null);});
it('AI hide leaves human information visible and explicit category opt-out suppresses banners',()=>{const visibility={alternative:true,supplement:true,ai:false,hiddenAITagIds:[]};expect(visibleEntry({supplementId:'s',ai:true},visibility)).toBe(false);expect(visibleEntry({supplementId:'s',ai:false},visibility)).toBe(true);const p=prefs();p.ownReactions.notify=false;expect(timelineEnabled({reasons:['ownReactions']},p)).toBe(false);});

it('keeps an optional preview and navigates from its explicit target control',async()=>{
  const w=make();await flushPromises();const navigate=vi.fn().mockResolvedValue(true);
  await w.setProps({navigateToTarget:navigate});
  api.target.mockResolvedValue({data:{available:true,post:{_id:'post'},target:{postId:'post',replyId:'reply'}}});
  w.vm.opened=true;await w.vm.openTarget({id:'one',type:'reply'},true);
  expect(w.vm.opened).toBe(true);expect(w.vm.target.target.replyId).toBe('reply');expect(navigate).not.toHaveBeenCalled();
  await w.vm.navigateSelectedTarget(w.vm.target.target);
  expect(w.vm.opened).toBe(false);expect(navigate).not.toHaveBeenCalled();
  await w.vm.navigateAfterClose();expect(navigate).toHaveBeenCalledOnce();expect(navigate.mock.calls[0][0].target.replyId).toBe('reply');w.unmount();
});
it('rechecks access on the second click and keeps the preview open if access is gone',async()=>{
  const w=make();await flushPromises();const navigate=vi.fn();await w.setProps({navigateToTarget:navigate});
  api.target.mockResolvedValue({data:{available:true,post:{_id:'post'},target:{postId:'post'}}});
  w.vm.opened=true;await w.vm.openTarget({id:'one',type:'post'},true);
  api.target.mockResolvedValue({data:{available:false}});await w.vm.navigateSelectedTarget({postId:'post'});
  expect(w.vm.opened).toBe(true);expect(w.vm.error).toBe('postDefaults.unavailable');expect(navigate).not.toHaveBeenCalled();w.unmount();
});
it('ignores a target response after the user closes the dialog',async()=>{
  const w=make();await flushPromises();let finish;api.target.mockImplementation(()=>new Promise(resolve=>finish=resolve));
  w.vm.opened=true;const pending=w.vm.openTarget({id:'one'});w.vm.close();
  finish({data:{available:true,post:{_id:'post'},target:{postId:'post'}}});await pending;expect(w.vm.target).toBe(null);expect(w.vm.opened).toBe(false);w.unmount();
});

it('master OFF suppresses personal and room banners without marking history read',async()=>{
  const w=make();await flushPromises();const value=prefs();value.timelineEnabled=false;api.preferences.mockResolvedValue({data:{version:2,value}});
  api.list.mockResolvedValue({data:{entries:[{id:'one',type:'reply',available:true,reasons:['ownUpdates','roomActivity']}],latestCursor:'next',nextCursor:null}});
  w.vm.exactTargetVisible=()=>false;await w.vm.poll();expect(w.vm.pending).toBe(false);expect(api.markRead).not.toHaveBeenCalled();w.unmount();
});
it('history-only row never creates a banner and disabling history clears both dependents',async()=>{
  const p=prefs();p.ownUpdates.timeline=false;expect(timelineEnabled({reasons:['ownUpdates']},p)).toBe(false);
  const w=make();await flushPromises();w.vm.draft=prefs();w.vm.draft.ownUpdates.notify=false;w.vm.draft.ownUpdates.push=true;w.vm.disableDependent('ownUpdates');expect(w.vm.draft.ownUpdates.timeline).toBe(false);expect(w.vm.draft.ownUpdates.push).toBe(false);w.unmount();
});
it('does not show a notice for the exact update already visible on screen',async()=>{
  const w=make();await flushPromises();api.list.mockResolvedValue({data:{entries:[{id:'one',type:'reply',available:true,reasons:['ownUpdates']}],latestCursor:'next',nextCursor:null}});w.vm.exactTargetVisible=()=>true;await w.vm.poll();expect(w.vm.pending).toBe(false);w.unmount();
});
it('three target rows provide labelled scope selects and guest push is disabled',async()=>{
  const w=make();await flushPromises();w.vm.showSettings();await w.vm.$nextTick();
  expect(w.findAll('.delivery-choices')).toHaveLength(3);
  for(const group of w.findAll('.delivery-choices')){
    const inputs=group.findAll('select');expect(inputs).toHaveLength(3);for(const input of inputs)expect(input.attributes('aria-label')).toBeTruthy();
    expect(inputs[1].attributes('disabled')).toBeDefined();
  }w.unmount();
});

it('polling does not overwrite filters last saved on another device',async()=>{
  const w=make();await flushPromises();api.savePreferences.mockClear();const value=prefs();value.context={globalQuery:{keyword:'from another device'},columns:[]};api.preferences.mockResolvedValue({data:{version:2,value}});
  await w.vm.poll();expect(api.savePreferences).not.toHaveBeenCalled();expect(w.vm.preferences.context.globalQuery.keyword).toBe('from another device');w.unmount();
});
it('saves the explicit three-target matrix instead of old personal rows',async()=>{
  const w=make();await flushPromises();w.vm.preferences.legacyPush={ownReply:false,participantReply:true,ownSupplement:true};w.vm.showSettings();w.vm.draft.scopes.roomActivity.timeline='off';
  api.savePreferences.mockResolvedValue({data:{version:2,value:prefs()}});await w.vm.saveSettings();const body=api.savePreferences.mock.calls.at(-1)[1];
  expect(body.value).not.toHaveProperty('ownUpdates');expect(body.value.scopes.roomActivity.timeline).toBe('off');expect(Object.keys(body.value.scopes)).toHaveLength(3);w.unmount();
});

it('tapping the Activity post navigates directly after closing, and only then marks it read',async()=>{
 const w=make();await flushPromises();const navigate=vi.fn().mockResolvedValue(true);await w.setProps({navigateToTarget:navigate});api.markRead.mockClear();
 api.target.mockResolvedValue({data:{available:true,post:{_id:'post'},target:{postId:'post',replyId:'reply'}}});w.vm.opened=true;
 await w.vm.openTarget({id:'one',type:'reply'});expect(w.vm.opened).toBe(false);expect(w.vm.target).toBe(null);expect(api.markRead).not.toHaveBeenCalled();
 await w.vm.navigateAfterClose();expect(navigate).toHaveBeenCalledOnce();expect(api.markRead).toHaveBeenCalledWith('a'.repeat(24),['one']);w.unmount();
});
it('saving context uses only the selected tab, not an OR with the unfiltered tab',async()=>{
 const w=make();await flushPromises();await w.setProps({filters:[{conditions:null},{conditions:{keyword:'chosen'}}],currentTabIndex:1});
 expect(w.vm.context().columns).toHaveLength(1);expect(w.vm.context().columns[0].keyword).toBe('chosen');w.unmount();
});
it('scope controls promote history and narrow dependent channels coherently',async()=>{
 const w=make();await flushPromises();w.vm.showSettings();const row=w.vm.draft.scopes.roomActivity;
 row.notify='matching';row.timeline='all';w.vm.alignScopes('roomActivity','timeline');expect(row.notify).toBe('all');
 row.push='all';row.notify='matching';w.vm.alignScopes('roomActivity','notify');expect(row.timeline).toBe('matching');expect(row.push).toBe('matching');w.unmount();
});
it('banner scope all ignores filters while matching follows them, without disabling history',()=>{
 const p=prefs();p.scopes={roomActivity:{notify:'all',timeline:'matching',push:'off'}};
 expect(timelineEnabled({reasons:['roomActivity']},p,false)).toBe(false);p.scopes.roomActivity.timeline='all';
 expect(timelineEnabled({reasons:['roomActivity']},p,false)).toBe(true);expect(p.roomActivity.notify).toBe(true);
});
