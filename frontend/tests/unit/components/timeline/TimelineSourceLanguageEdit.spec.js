import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount} from '@vue/test-utils';
import Editor from '@/components/timeline/TimelineSourceLanguageEdit.vue';
import chatApi from '@/api/chat';
vi.mock('@/api/chat',()=>({default:{updateSourceLanguage:vi.fn(),fetchDetail:vi.fn()}}));
const item={_id:'p',content:'Hello.',lang:'ja',user:{_id:'owner'}};
const build=(getters={},props={})=>mount(Editor,{props:{item,postId:'p',...props},global:{
  mocks:{$t:k=>k,$i18n:{locale:'ja'},$store:{getters:{roomId:'r',userId:'reader',collaborativeTextEditing:false,...getters}}},stubs:{BaseEditDialog:{template:'<div><slot /></div>'}}}});
beforeEach(()=>vi.clearAllMocks());
describe('language-only correction',()=>{
 it('is offered to another signed-in user even when shared text editing is off',()=>{
  const w=build();expect(w.find('button[aria-label="sourceLanguage.edit"]').exists()).toBe(true);w.unmount();
 });
 it.each([{userId:null},{userId:''}])('is hidden for a guest',getters=>{
  const w=build(getters);expect(w.find('button').exists()).toBe(false);w.unmount();
 });
 it('is hidden for a read-only preview',()=>{
  const w=build({},{readOnly:true});expect(w.find('button').exists()).toBe(false);w.unmount();
 });
 it('shows the original text as read-only and sends no body mutation',async()=>{
  const w=build();await w.find('button[aria-label="sourceLanguage.edit"]').trigger('click');
  expect(w.find('textarea').exists()).toBe(false);expect(w.find('.original-text').text()).toBe('Hello.');
  await w.find('select').setValue('en');chatApi.updateSourceLanguage.mockResolvedValueOnce({data:{...item,lang:'en'}});await w.vm.save();
  expect(chatApi.updateSourceLanguage).toHaveBeenCalledWith({room_id:'r',post_id:'p',reply_id:undefined,supplement_id:undefined,lang:'en',expected:{content:'Hello.',lang:'ja'}});
  expect(w.vm.$i18n.locale).toBe('ja');expect(w.find('[role="status"]').text()).toBe('sourceLanguage.saved');w.unmount();
 });
 it('keeps the selected language on failure and reloads the latest body after a conflict',async()=>{
  const w=build();w.vm.startEdit();w.vm.language='en';chatApi.updateSourceLanguage.mockRejectedValueOnce({response:{status:409}});await w.vm.save();
  expect(w.vm.language).toBe('en');expect(w.vm.editing).toBe(true);expect(w.vm.conflicted).toBe(true);
  chatApi.fetchDetail.mockResolvedValueOnce({data:{...item,content:'New text',lang:'fr'}});await w.vm.refresh();
  expect(w.vm.expected).toEqual({content:'New text',lang:'fr'});expect(w.vm.conflicted).toBe(false);w.unmount();
 });
});
