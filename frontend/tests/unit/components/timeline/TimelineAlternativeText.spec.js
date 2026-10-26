import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TimelineAlternativeText from '@/components/timeline/TimelineAlternativeText.vue';
import chatApi from '@/api/chat';
vi.mock('@/api/chat', () => ({ default: { updateAlternativeText: vi.fn(), fetchDetail: vi.fn() } }));
const make = (options={}) => mount(TimelineAlternativeText, { attachTo: document.body, props: { item:{_id:'p',image_name:'a.png',image_caption:'あ'.repeat(2000)}, kind:'image',postId:'p',descriptionId:'alt-description',...options.props },
  global:{ mocks:{$t:k=>k,$store:{getters:{userId:'other',roomId:'room',collaborativeTextEditing:true,displayAlternativeText:options.show ?? true,...options.getters}}},stubs:{BaseEditDialog:true} } });
describe('shared alternative text',()=>{
 describe.each(['image', 'video', 'audio'])('missing %s description', kind => {
  const item = { _id:'p', user:'owner', [`${kind}_name`]:'sample', image_caption:'', video_description:'', audio_description:'' };
  it.each([
   ['guest', {userId:undefined}, false],
   ['other reader', {userId:'reader',collaborativeTextEditing:false}, false],
   ['collaborative author', {userId:'reader',collaborativeTextEditing:true}, true],
   ['owner', {userId:'owner',collaborativeTextEditing:false}, true],
   ['administrator', {userId:'admin',userRole:'Administrator',collaborativeTextEditing:false}, true],
  ])('keeps the description association and shows an add control only for %s with permission', async (_role, getters, allowed) => {
   const w=make({props:{item,kind},getters});
   expect(w.get('#alt-description').text()).toBe('altText.missing');
   expect(w.get('#alt-description').attributes()).toHaveProperty('hidden');
   expect(w.find('section.alternative-text').exists()).toBe(allowed);
   expect(w.find('.alt-copy').exists()).toBe(false);
   expect(w.find('.shared-text-edit').exists()).toBe(allowed);
   if(allowed) {
    expect(w.get('.shared-text-edit').attributes('aria-label')).toBe('altText.add');
    await w.get('.shared-text-edit').trigger('click');
    expect(w.vm.editing).toBe(true);expect(w.vm.draft).toBe('');
   }
   await w.setProps({item:{...item,[kind==='image'?'image_caption':`${kind}_description`]:'Description'}});
   expect(w.get('#alt-description').text()).toBe('Description');
   expect(w.get('.alt-copy p').text()).toBe('Description');
   await w.setProps({item});
   expect(w.find('section.alternative-text').exists()).toBe(allowed);
   w.unmount();
  });
  it('does not show an empty frame or edit control in read-only views', () => {
   const w=make({props:{item,kind,readOnly:true}});
   expect(w.find('section.alternative-text').exists()).toBe(false);
   expect(w.get('#alt-description').text()).toBe('altText.missing');w.unmount();
  });
 });

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
