import { describe, it, expect, vi } from 'vitest';
import { pdfFirstPage, MAX_PDF_SIZE, isPdfFile } from '@/features/timeline/pdfFirstPage';

const fixture = () => ({name:'poster.pdf',type:'application/pdf',size:32,arrayBuffer:vi.fn(async()=>new ArrayBuffer(32))});
function engine({blobSize=64}={}) {
  const page={getViewport:vi.fn(({scale})=>({width:600*scale,height:800*scale})),render:vi.fn(()=>({promise:Promise.resolve()}))};
  const pdf={numPages:3,getPage:vi.fn(async()=>page)};
  const task={promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})};
  const lib={getDocument:vi.fn(()=>task)};
  const canvas={getContext:vi.fn(()=>({fillRect:vi.fn(),drawImage:vi.fn()})),toBlob:vi.fn((cb,type)=>cb(new Blob([new Uint8Array(type==='image/png'?blobSize:64)],{type})))};
  return {page,pdf,task,lib,canvas,options:{loadPdf:async()=>lib,createCanvas:()=>canvas}};
}
describe('PDF first page image attachment',()=>{
 it('renders page 1 only, preserves the page count, and returns an image instead of the PDF',async()=>{
  const e=engine(),file=fixture(),r=await pdfFirstPage(file,e.options);
  expect(e.pdf.getPage).toHaveBeenCalledExactlyOnceWith(1);expect(r.pageCount).toBe(3);
  expect(r.file.name).toBe('poster-page-1.png');expect(r.file.type).toBe('image/png');expect(file.name).toBe('poster.pdf');
  expect(e.page.render.mock.calls[0][0].viewport).toEqual({width:2250,height:3000});
  expect(e.lib.getDocument.mock.calls[0][0]).toMatchObject({isEvalSupported:false,cMapUrl:'/pdfjs/cmaps/',standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});
  expect(e.task.destroy).toHaveBeenCalledOnce();expect(e.canvas.width).toBe(0);
 });
 it('renders the chosen page and checks bounds before rendering',async()=>{
  const e=engine(),r=await pdfFirstPage(fixture(),{...e.options,pageNumber:2});
  expect(e.pdf.getPage).toHaveBeenCalledExactlyOnceWith(2);expect(r.pageNumber).toBe(2);expect(r.file.name).toBe('poster-page-2.png');
  for(const pageNumber of [0,4,1.5]) { const invalid=engine();await expect(pdfFirstPage(fixture(),{...invalid.options,pageNumber})).rejects.toThrow('PDF_PAGE_INVALID');expect(invalid.pdf.getPage).not.toHaveBeenCalled(); }
 });
 it('falls back to JPEG when PNG exceeds the existing image limit',async()=>{
  const e=engine({blobSize:4*1024*1024}),r=await pdfFirstPage(fixture(),e.options);
  expect(r.file.type).toBe('image/jpeg');expect(r.file.name).toBe('poster-page-1.jpg');
 });
 it('rejects oversized or empty PDFs before loading the PDF library',async()=>{
  const loadPdf=vi.fn();
  await expect(pdfFirstPage({...fixture(),size:MAX_PDF_SIZE+1},{loadPdf})).rejects.toThrow('PDF_TOO_LARGE');
  await expect(pdfFirstPage({...fixture(),size:0},{loadPdf})).rejects.toThrow('PDF_INVALID');expect(loadPdf).not.toHaveBeenCalled();
 });
 it('allows a PDF extension when a platform supplies a generic MIME',()=>{
  expect(isPdfFile({name:'paper.PDF',type:'application/octet-stream'})).toBe(true);expect(isPdfFile({name:'photo.jpg',type:'image/jpeg'})).toBe(false);
 });
 it('releases PDF resources on parse failure',async()=>{
  const e=engine();e.task.promise=Promise.reject(new Error('bad PDF'));
  await expect(pdfFirstPage(fixture(),e.options)).rejects.toThrow('bad PDF');expect(e.task.destroy).toHaveBeenCalledOnce();
 });
 it('does not return a late conversion after cancellation',async()=>{
  const e=engine(),controller=new AbortController();e.page.render.mockImplementation(()=>{controller.abort();return {promise:Promise.resolve()};});
  await expect(pdfFirstPage(fixture(),{...e.options,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
  expect(e.canvas.toBlob).not.toHaveBeenCalled();expect(e.canvas.width).toBe(0);
 });
 it('does not read or load a PDF already cancelled',async()=>{
  const e=engine(),controller=new AbortController(),file=fixture();controller.abort();
  await expect(pdfFirstPage(file,{...e.options,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(file.arrayBuffer).not.toHaveBeenCalled();
 });
});
