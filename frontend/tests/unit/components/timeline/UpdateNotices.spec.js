import { describe,it,expect } from 'vitest';
import {mount} from '@vue/test-utils';
import {reactive} from 'vue';
import UpdateNotices from '@/components/timeline/UpdateNotices.vue';
const room='202610240000000000000002';
describe('viewer update cards',()=>{
 it('waits for Show, groups root updates, and handles a later update without silently marking it read',async()=>{
  const state=reactive({updateNotices:[{key:'a',roomId:room,postId:'p',kind:'alternative',at:1},{key:'s',roomId:room,postId:'p',supplementId:'s',kind:'supplement',at:2}]});
  const store={state,getters:{roomUpdatePreference:()=>({enabled:true,scope:'all'}),isSupplementVisible:()=>true},commit:()=>{}};
  const wrapper=mount(UpdateNotices,{props:{filter:{posts:[{_id:'p',content:'original',supplementaries:[{_id:'s',content:'detail'}]}]},roomId:room},global:{mocks:{$store:store,$t:key=>key}}});
  expect(wrapper.findAll('.update-card')).toHaveLength(0);expect(wrapper.vm.pendingCount).toBe(1);
  await wrapper.get('.pending button').trigger('click');expect(wrapper.findAll('.update-card')).toHaveLength(1);expect(wrapper.findAll('.notice-row')).toHaveLength(2);
  state.updateNotices[0].at=3;await wrapper.vm.$forceUpdate();await wrapper.vm.$nextTick();expect(wrapper.vm.pendingCount).toBe(1);
  wrapper.unmount();
 });
});
