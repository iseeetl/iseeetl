import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TimelineAlternativeText from '@/components/timeline/TimelineAlternativeText.vue';
import chatApi from '@/api/chat';
vi.mock('@/api/chat', () => ({ default: { updateAlternativeText: vi.fn(), fetchDetail: vi.fn() } }));
const make = (options={}) => mount(TimelineAlternativeText, { attachTo: document.body, props: { item:{_id:'p',image_name:'a.png',image_caption:'あ'.repeat(2000)}, kind:'image',postId:'p',descriptionId:'alt-description',...options.props },
  global:{ mocks:{$t:k=>k,$store:{getters:{userId:'other',roomId:'room',collaborativeTextEditing:true,displayAlternativeText:options.show ?? true,...options.getters}}},stubs:{BaseEditDialog:true} } });
describe('shared alternative text',()=>{
 it('uses the existing reaction icon and restores focus after Escape or an outside click',async()=>{
  const w=make({getters:{displayActionButton:true}});
  const trigger=w.get('.alt-react-button');
  expect(trigger.attributes('aria-label')).toBe('altText.reactionTarget');
  expect(trigger.text()).toBe('add_reaction');
  await trigger.trigger('click');await w.vm.$nextTick();
  const first=w.get('.reaction-picker button');
  expect(document.activeElement).toBe(first.element);
  expect(trigger.attributes('aria-expanded')).toBe('true');
  await first.trigger('keydown',{key:'Escape'});
  expect(w.find('.reaction-picker').exists()).toBe(false);
  expect(document.activeElement).toBe(trigger.element);
  await trigger.trigger('click');await w.vm.$nextTick();
  document.body.dispatchEvent(new Event('pointerup',{bubbles:true}));await w.vm.$nextTick();
  expect(w.find('.reaction-picker').exists()).toBe(false);
  expect(document.activeElement).toBe(trigger.element);w.unmount();
 });
 it('folds only over 400, exposes full text to AT and preserves keyboard buttons',async()=>{
  const w=make();expect(w.get('.alt-copy p').text().length).toBe(301);
  expect(w.get('#alt-description').text().length).toBe(2000);
  await w.findAll('button')[0].trigger('click');expect(w.get('.alt-copy p').text().length).toBe(2000);
  expect(w.findAll('button')[0].attributes('aria-expanded')).toBe('true');w.unmount();
 });
 it('keeps an open control when inline display is disabled and does not allow guest edit',async()=>{
  const w=make({show:false,props:{readOnly:true}});expect(w.get('.alt-copy').isVisible()).toBe(false);
  const open=w.findAll('button').find(b=>b.text()==='altText.open');expect(open.exists()).toBe(true);
  await open.trigger('click');expect(w.get('.alt-copy').isVisible()).toBe(true);expect(w.text()).not.toContain('altText.edit');w.unmount();
 });
 it('sends text and snapshot only, keeps draft on conflict and never retries automatically',async()=>{
  const w=make();w.vm.startEdit();w.vm.draft='changed';chatApi.updateAlternativeText.mockRejectedValueOnce({response:{status:409}});
  await w.vm.save();expect(w.vm.draft).toBe('changed');expect(w.vm.conflicted).toBe(true);expect(w.vm.editing).toBe(true);
  const payload=chatApi.updateAlternativeText.mock.calls.at(-1)[0];expect(payload.text).toBe('changed');expect(payload).not.toHaveProperty('content');
  await w.vm.save();expect(chatApi.updateAlternativeText).toHaveBeenCalledTimes(1);w.unmount();
 });
});
