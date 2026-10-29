import {describe,it,expect,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import Editor from '@/components/timeline/TimelineSupplementTextEdit.vue';
import chatApi from '@/api/chat';
import {canEditSharedText} from '@/features/timeline/sharedTextPermission';
vi.mock('@/api/chat',()=>({default:{updateSupplementText:vi.fn(),fetchDetail:vi.fn()}}));
describe('room text editing option',()=>{
 it('requires login and room opt-in, while preserving owner/manager rights',()=>{
  const item={user:{_id:'owner'}};
  expect(canEditSharedText(item,{userId:null,collaborativeTextEditing:true})).toBe(false);
  expect(canEditSharedText(item,{userId:'other'})).toBe(false);
  expect(canEditSharedText(item,{userId:'other',collaborativeTextEditing:true})).toBe(true);
  expect(canEditSharedText(item,{userId:'owner'})).toBe(true);
  expect(canEditSharedText(item,{userId:'other',roomRole:'FloorMember'})).toBe(true);
 });
 it('offers only text editing, preserves original language and retains draft on conflict',async()=>{
  const w=mount(Editor,{props:{item:{_id:'s',content:'original',lang:'en',user:{_id:'owner'},ai_origin:{kind:'conversation'}},kind:'supplement',postId:'p',supplementId:'s'},
   global:{mocks:{$t:k=>k,$i18n:{locale:'ja'},$store:{getters:{userId:'other',roomId:'r',collaborativeTextEditing:true}}},stubs:{BaseEditDialog:true}}});
  expect(w.find('button[aria-label="sharedText.edit"]').exists()).toBe(true);
  w.vm.startEdit();w.vm.draft='updated';chatApi.updateSupplementText.mockRejectedValueOnce({response:{status:409}});await w.vm.save();
  expect(chatApi.updateSupplementText).toHaveBeenCalledWith({room_id:'r',post_id:'p',reply_id:undefined,supplement_id:'s',text:'updated',lang:'en',expected:{content:'original',lang:'en'}});
  expect(w.vm.draft).toBe('updated');expect(w.vm.conflicted).toBe(true);w.unmount();
 });
});


it('corrects an AI transcript language while preserving its body and conflict guard',async()=>{
  const w=mount(Editor,{props:{item:{_id:'s',content:'Hello.',lang:'ja',user:{_id:'owner'},ai_origin:{kind:'speech'}},kind:'supplement',postId:'p',supplementId:'s'},global:{mocks:{$t:k=>k,$i18n:{locale:'ja'},$store:{getters:{userId:'owner',roomId:'r'}}},stubs:{BaseEditDialog:true}}});
  chatApi.updateSupplementText.mockResolvedValueOnce({data:{}});w.vm.startEdit();w.vm.sourceLanguage='en';await w.vm.save();
  expect(chatApi.updateSupplementText).toHaveBeenLastCalledWith({room_id:'r',post_id:'p',reply_id:undefined,supplement_id:'s',text:'Hello.',lang:'en',expected:{content:'Hello.',lang:'ja'}});w.unmount();
});
