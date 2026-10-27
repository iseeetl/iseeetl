import { describe,it,expect,vi,afterEach } from 'vitest';
import Post from '@/components/timeline/dialogs/EditPostDialog.vue';
import Reply from '@/components/timeline/dialogs/EditReplyDialog.vue';
import Supplement from '@/components/timeline/dialogs/EditSupplementDialog.vue';
import { prepareImageAttachment } from '@/features/timeline/imageAttachment';
vi.mock('@/features/timeline/imageAttachment',()=>({prepareImageAttachment:vi.fn()}));
afterEach(()=>vi.restoreAllMocks());
describe.each([['post',Post],['reply',Reply],['supplement',Supplement]])('%s image attachment lifecycle',(_name,component)=>{
 const context=()=>({imageGeneration:0,imagePreparing:false,imageCaption:'existing description',imageData:'old-image',imageFile:'old-file',removeMedia:vi.fn(function(){this.imageData=null;this.imageCaption=null;}),setSnackbar:vi.fn(),$t:k=>k});
 it('blocks sending while converting and preserves the previous attachment on failure',async()=>{
  let fail;prepareImageAttachment.mockImplementationOnce(()=>new Promise((_r,reject)=>{fail=reject;}));const ctx=context();const task=component.methods.handleImageChange.call(ctx,new File(['bad'],'bad.jpg'));
  expect(ctx.imagePreparing).toBe(true);expect(ctx.removeMedia).not.toHaveBeenCalled();fail(new Error('broken'));await task;expect(ctx.imageData).toBe('old-image');expect(ctx.imageCaption).toBe('existing description');expect(ctx.imagePreparing).toBe(false);expect(ctx.setSnackbar).toHaveBeenCalled();
 });
 it('preserves the caption when a PDF page is changed',async()=>{
  const file=new File(['png'],'p.png',{type:'image/png'});prepareImageAttachment.mockResolvedValueOnce(file);URL.createObjectURL=vi.fn(()=>'blob:new');const ctx=context();await component.methods.handleImageChange.call(ctx,file,{preserveCaption:true});expect(ctx.imageFile).toBe(file);expect(ctx.imageCaption).toBe('existing description');expect(ctx.imagePreparing).toBe(false);
 });
 it('ignores a conversion completed after a reset or unmount',async()=>{
  let done;prepareImageAttachment.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));const ctx=context();const task=component.methods.handleImageChange.call(ctx,new File(['a'],'a.jpg'));ctx.imageGeneration++;done(new File(['a'],'a.jpg'));await task;expect(ctx.removeMedia).not.toHaveBeenCalled();expect(ctx.imageData).toBe('old-image');
 });
});
