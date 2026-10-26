import { describe,it,expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TimelineMediaDescription from '@/components/timeline/TimelineMediaDescription.vue';
const make=description=>mount(TimelineMediaDescription,{props:{description},global:{mocks:{$t:key=>key}}});
describe('long media descriptions',()=>{
 it('keeps 400 units visible and expands longer text without changing it',async()=>{
  const w=make('a'.repeat(400));expect(w.find('button').exists()).toBe(false);
  await w.setProps({description:'あ'.repeat(2000)});const button=w.get('button');const body=w.get('span');
  expect(body.text()).toBe('あ'.repeat(300)+'…');expect(button.attributes('aria-expanded')).toBe('false');expect(button.attributes('aria-controls')).toBe(body.attributes('id'));
  await button.trigger('click');expect(body.text()).toBe('あ'.repeat(2000));expect(button.attributes('aria-expanded')).toBe('true');
  await button.trigger('click');expect(body.text().length).toBe(301);expect(w.props('description').length).toBe(2000);w.unmount();
 });
});
