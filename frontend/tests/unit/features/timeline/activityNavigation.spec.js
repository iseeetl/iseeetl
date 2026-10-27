import { describe, it, expect, vi } from 'vitest';
import { activityItem, updateActivityPost, canShowActivityInColumn, activityNavigationMethods as methods } from '@/features/timeline/activityNavigation';

const root = () => {
  const el = document.createElement('div');
  el.innerHTML = '<div id="timeline-inner-0"><div class="timeline-content"><article tabindex="-1" data-timeline-item-id="p">Parent<section data-alt-kind="image">Alt</section><article data-timeline-item-id="s">Supplement</article></article><article data-timeline-item-id="r">Reply</article></div></div>';
  document.body.append(el); return el;
};
const context = el => ({...methods,$el:el,activityNavigation:{target:{postId:'p',replyId:'r',columnIndex:0},label:''},$t:key=>key});

describe('activity navigation',()=>{
  it('selects exactly the updated item and can select its parent',()=>{const el=root();expect(activityItem(el,{postId:'p',supplementId:'s'}).textContent).toBe('Supplement');expect(activityItem(el,{postId:'p',media:'image'}).textContent).toBe('Alt');expect(activityItem(el,{postId:'p',replyId:'r'},true).dataset.timelineItemId).toBe('p');el.remove();});
  it('updates loaded posts in place and inserts older posts by date',()=>{const rows=[{_id:'new',created_at:'2026-10-28'}, {_id:'old',created_at:'2026-10-20'}];updateActivityPost(rows,{_id:'old',created_at:'2026-10-20',content:'updated'});expect(rows.map(p=>p._id)).toEqual(['new','old']);updateActivityPost(rows,{_id:'mid',created_at:'2026-10-24'});expect(rows.map(p=>p._id)).toEqual(['new','mid','old']);});
  it('moves keyboard focus and only scrolls the chosen column; reduced motion is immediate',()=>{const el=root(),ctx=context(el),scroller=el.querySelector('.timeline-content');scroller.scrollTo=vi.fn();const original=window.matchMedia;window.matchMedia=()=>({matches:true});expect(ctx.focusActivityLocation(false,'Reply')).toBe(true);expect(document.activeElement.dataset.timelineItemId).toBe('r');expect(scroller.scrollTo).toHaveBeenCalledWith(expect.objectContaining({behavior:'instant'}));expect(document.activeElement.getAttribute('aria-describedby')).toBe('activity-location-status');ctx.clearActivityLocation();expect(el.querySelector('.activity-timeline-highlight')).toBe(null);window.matchMedia=original;el.remove();});
  it('uses smooth scrolling normally and can focus the parent',()=>{const el=root(),ctx=context(el);el.querySelector('.timeline-content').scrollTo=vi.fn();const original=window.matchMedia;window.matchMedia=()=>({matches:false});ctx.focusActivityParent();expect(document.activeElement.dataset.timelineItemId).toBe('p');expect(el.querySelector('.timeline-content').scrollTo).toHaveBeenCalledWith(expect.objectContaining({behavior:'smooth'}));ctx.clearActivityLocation();window.matchMedia=original;el.remove();});
  it('ignores cancelled navigation without touching filters',async()=>{const el=root(),ctx=context(el);Object.assign(ctx,{$store:{getters:{roomId:'room'}},timelineResourcesReady:true,infra:{isSocketConnect:true},timeline:{filters:[]}});expect(await ctx.navigateToActivity({available:true,post:{_id:'p'},target:{postId:'p'}},'Post',()=>false)).toBe(false);el.remove();});
});


describe('activity returns to the Timeline column', () => {
  it.each([0, 1])('selects the conditionless column at index %s even if the filtered panel already has the post', async timelineIndex => {
    const currentIndex = timelineIndex === 0 ? 1 : 0;
    const post = {_id:'p',created_at:'2026-10-28'};
    const filtered = {conditions:{tags:['other']},posts:[{...post,content:'old'}]};
    const timeline = {conditions:null,posts:[]};
    const filters = timelineIndex === 0 ? [timeline,filtered] : [filtered,timeline];
    const ctx = {...methods,$store:{getters:{roomId:'room'}},timelineResourcesReady:true,infra:{isSocketConnect:true},
      timeline:{filters},ui:{currentTabIndex:currentIndex},activityNavigation:{},$nextTick:async()=>{},
      ensurePostsArray:vi.fn(),fetchTimelinePosts:vi.fn(),focusActivityLocation:vi.fn(()=>true),ensureSmartphoneTabVisible:vi.fn()};
    expect(await ctx.navigateToActivity({available:true,post:{...post,content:'new'},target:{postId:'p'}},'Post')).toBe(true);
    expect(ctx.ui.currentTabIndex).toBe(timelineIndex);
    expect(ctx.activityNavigation.target.columnIndex).toBe(timelineIndex);
    expect(timeline.posts[0].content).toBe('new');expect(filtered.posts[0].content).toBe('old');
    expect(filtered.conditions).toEqual({tags:['other']});expect(ctx.focusActivityLocation).toHaveBeenCalledWith(false,'Post');
    expect(ctx.ensureSmartphoneTabVisible).toHaveBeenCalledWith(timelineIndex,true);
  });
  it('loads older history into Timeline even if the target is already loaded in another panel',async()=>{
    const post={_id:'old',created_at:'2026-10-20'};
    const ctx={...methods,$store:{getters:{roomId:'room'}},timelineResourcesReady:true,infra:{isSocketConnect:true},
      timeline:{filters:[{conditions:null,posts:[{_id:'new',created_at:'2026-10-28'}]},{conditions:{tags:['tag']},posts:[post]}]},
      ui:{currentTabIndex:1},activityNavigation:{},$nextTick:async()=>{},ensurePostsArray:vi.fn(),fetchTimelinePosts:vi.fn(),focusActivityLocation:vi.fn(()=>true)};
    expect(await ctx.navigateToActivity({available:true,post,target:{postId:'old'}},'Post')).toBe(true);
    expect(ctx.fetchTimelinePosts).toHaveBeenCalledWith(0,{from:'2026-10-28',to:'2026-10-20',position:'tail'});
    expect(ctx.timeline.filters[0].posts.map(p=>p._id)).toEqual(['new','old']);
  });
  it('never falls back to a filtered panel if Timeline is not ready',async()=>{
    const ctx={...methods,$store:{getters:{roomId:'room'}},timelineResourcesReady:true,infra:{isSocketConnect:true},
      timeline:{filters:[{conditions:{tags:['tag']},posts:[{_id:'p'}]}]},ui:{currentTabIndex:0},activityNavigation:{},clearActivityLocation:vi.fn()};
    expect(await ctx.navigateToActivity({available:true,post:{_id:'p'},target:{postId:'p'}},'Post')).toBe(false);
    expect(ctx.clearActivityLocation).not.toHaveBeenCalled();
  });
});

describe('selected tab first',()=>{
 const make=()=>({...methods,$store:{getters:{roomId:'room'}},timelineResourcesReady:true,infra:{isSocketConnect:true},
  timeline:{filters:[{conditions:null,posts:[]},{conditions:{keyword:'match'},posts:[{_id:'new',created_at:'2026-10-28'}]}]},
  ui:{currentTabIndex:1,queryFilters:{}},activityNavigation:{},$nextTick:async()=>{},matchesAny:()=>true,
  ensurePostsArray:vi.fn(),fetchTimelinePosts:vi.fn(),focusActivityLocation:vi.fn(()=>true)});
 it('loads an old matching post into the current filtered tab and preserves its conditions',async()=>{
  const ctx=make(),post={_id:'old',created_at:'2026-10-20'};expect(await ctx.navigateToActivity({available:true,post,target:{postId:'old'}},'Post')).toBe(true);
  expect(ctx.ui.currentTabIndex).toBe(1);expect(ctx.fetchTimelinePosts).toHaveBeenCalledWith(1,{from:'2026-10-28',to:'2026-10-20',position:'tail'});
  expect(ctx.timeline.filters[0].posts).toEqual([]);expect(ctx.timeline.filters[1].conditions).toEqual({keyword:'match'});
 });
 it('uses Timeline when the exact reply is hidden or fails target-only conditions',async()=>{
  const ctx=make(),post={_id:'p',replies:[{_id:'r'}]},value={available:true,post,target:{postId:'p',replyId:'r'}};
  ctx.ui.hideReply=true;expect(canShowActivityInColumn(ctx,value,1)).toBe(false);
  ctx.ui.hideReply=false;ctx.ui.queryFilters.globalShowRange='target';ctx.doesDataMatchConditions=()=>false;
  expect(await ctx.navigateToActivity(value,'Reply')).toBe(true);expect(ctx.ui.currentTabIndex).toBe(0);
 });
 it('does not need another Timeline column when the current tab can show the target',async()=>{
  const ctx=make();ctx.timeline.filters=ctx.timeline.filters.slice(1);ctx.ui.currentTabIndex=0;
  expect(await ctx.navigateToActivity({available:true,post:{_id:'p'},target:{postId:'p'}},'Post')).toBe(true);expect(ctx.ui.currentTabIndex).toBe(0);
 });
});
