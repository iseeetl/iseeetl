import { describe,it,expect,vi,afterEach } from 'vitest';
import { shallowMount,flushPromises } from '@vue/test-utils';
import MediaInput from '@/components/timeline/inputs/MediaInput.vue';
import { pdfFirstPage } from '@/features/timeline/pdfFirstPage';
vi.mock('@/features/timeline/pdfFirstPage',()=>({isPdfFile:f=>/\.pdf$/i.test(f.name),pdfFirstPage:vi.fn()}));
const make=props=>shallowMount(MediaInput,{props:{idPrefix:'test',imageData:'prior-image',imageCaption:'prior text',...props},global:{mocks:{$t:k=>k}}});
afterEach(()=>vi.restoreAllMocks());
describe('shared attachment and PDF flow',()=>{
 it.each(['iPhone Safari','Macintosh Safari'])('opens the OS file chooser directly on %s',ua=>{
  vi.spyOn(navigator,'userAgent','get').mockReturnValue(ua);const w=make();w.vm.$refs.inputAttachment.click=vi.fn();w.vm.openAttachment();
  expect(w.vm.$refs.inputAttachment.click).toHaveBeenCalledOnce();expect(w.vm.attachmentMenu).toBe(false);expect(w.vm.$refs.inputAttachment.accept).toContain('application/pdf');w.unmount();
 });
 it('offers Android photo-library, capture, and file routes without audio in the library filter',async()=>{
  vi.spyOn(navigator,'userAgent','get').mockReturnValue('Android Chrome');const w=make();w.vm.openAttachment();await w.vm.$nextTick();
  expect(w.vm.attachmentMenu).toBe(true);expect(w.emitted('source-busy-change').at(-1)).toEqual([true]);
  const library=w.vm.$refs.inputLibrary;library.click=vi.fn();w.vm.pickAttachmentSource('library');expect(library.click).toHaveBeenCalledOnce();expect(library.accept).not.toContain('audio/');expect(w.vm.attachmentMenu).toBe(false);w.unmount();
 });
 it('keeps the guest login route instead of opening a picker',()=>{
  const w=make({locked:true});w.vm.$refs.inputAttachment.click=vi.fn();w.vm.openAttachment();expect(w.emitted('guest-attempt')).toHaveLength(1);expect(w.vm.$refs.inputAttachment.click).not.toHaveBeenCalled();w.unmount();
 });
 it('keeps a draft on PDF error and reports the error',async()=>{
  pdfFirstPage.mockRejectedValueOnce(new Error('invalid'));const w=make();await w.vm.handleSourceSelection({target:{files:[new File(['x'],'bad.pdf')]}});
  expect(w.vm.pdfError).toBe('composerPdf.failed');expect(w.props('imageData')).toBe('prior-image');expect(w.vm.localImageCaption).toBe('prior text');expect(w.emitted('image-change')).toBeUndefined();expect(w.vm.pdfConverting).toBe(false);w.unmount();
 });
 it.each([
  [Object.assign(new Error('locked'),{name:'PasswordException'}),'composerPdf.password'],
  [new Error('PDF_TOO_LARGE'),'composerPdf.tooLarge'],
 ])('shows a specific PDF rejection while keeping the draft',async(error,key)=>{
  pdfFirstPage.mockRejectedValueOnce(error);const w=make();await w.vm.convertPdf(new File(['x'],'poster.pdf'));
  expect(w.vm.pdfError).toBe(key);expect(w.props('imageData')).toBe('prior-image');expect(w.vm.localImageCaption).toBe('prior text');w.unmount();
 });
 it('emits only the rendered image and shows total PDF pages',async()=>{
  const image=new File(['png'],'page.png',{type:'image/png'});pdfFirstPage.mockResolvedValueOnce({file:image,pageCount:4});const w=make();
  await w.vm.handleSourceSelection({target:{files:[new File(['pdf'],'poster.pdf')]}});expect(w.emitted('image-change')).toEqual([[image,{preserveCaption:false}]]);expect(w.vm.pdfInfo.pageCount).toBe(4);w.unmount();
 });
 it('changes pages without changing the caption and resets to the last good page on failure',async()=>{
  const image=new File(['png'],'page.png',{type:'image/png'}),w=make(),pdf=new File(['x'],'poster.pdf');
  pdfFirstPage.mockResolvedValueOnce({file:image,pageCount:3,pageNumber:1});await w.vm.convertPdf(pdf);
  w.vm.pdfPage=2;pdfFirstPage.mockResolvedValueOnce({file:image,pageCount:3,pageNumber:2});await w.vm.changePdfPage();
  expect(pdfFirstPage).toHaveBeenLastCalledWith(pdf,expect.objectContaining({pageNumber:2}));expect(w.vm.pdfInfo.pageNumber).toBe(2);
  expect(w.emitted('image-change').at(-1)[1]).toEqual({preserveCaption:true});
  w.vm.pdfPage=3;pdfFirstPage.mockRejectedValueOnce(new Error('bad'));await w.vm.changePdfPage();
  expect(w.vm.pdfPage).toBe(2);expect(w.vm.pdfInfo.pageNumber).toBe(2);expect(w.vm.localImageCaption).toBe('prior text');
  w.vm.pdfPage=999;await w.vm.changePdfPage();expect(w.vm.pdfPage).toBe(2);expect(w.vm.pdfError).toBe('composerPdf.invalidPage');w.unmount();
 });
 it('discards results arriving after cancellation and clears pending UI on dialog reset',async()=>{
  let done;pdfFirstPage.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));const w=make();
  const pending=w.vm.handleSourceSelection({target:{files:[new File(['pdf'],'poster.pdf')]}});await flushPromises();expect(w.vm.pdfConverting).toBe(true);
  w.vm.resetAttachment();done({file:new File(['png'],'page.png'),pageCount:1});await pending;
  expect(w.emitted('image-change')).toBeUndefined();expect(w.vm.pdfInfo).toBe(null);expect(w.vm.pdfConverting).toBe(false);w.unmount();
 });
});
