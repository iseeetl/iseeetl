import { describe, it, expect, vi } from 'vitest';
import { encodeImageAttachment, prepareImageAttachment } from '@/features/timeline/imageAttachment';
import { MAX_IMAGE_EDGE, MAX_IMAGE_SIZE_IN_BYTES } from '@/constants/mediaConstants';
const canvas = (width, height, size = () => 100) => {
 const ctx={fillRect:vi.fn(),drawImage:vi.fn()};
 const c={width,height,getContext:vi.fn(()=>ctx),toBlob:vi.fn((cb,type,quality)=>cb(new Blob([new Uint8Array(size(type,quality,c.width,c.height))],{type})))};
 return c;
};
describe('image attachment bounds and quality',()=>{
 it('scales a large image to 3000 pixels without changing aspect ratio',async()=>{
  const source=canvas(4032,3024),scratch=canvas(0,0),r=await encodeImageAttachment(source,{createCanvas:()=>scratch});
  expect(scratch.getContext().drawImage).toHaveBeenCalledWith(source,0,0,3000,2250);expect(r.type).toBe('image/jpeg');expect(r.size).toBeLessThanOrEqual(MAX_IMAGE_SIZE_IN_BYTES);expect(source.width).toBe(4032);
 });
 it('does not enlarge small images and does not recompress a prepared PDF image',async()=>{
  const source=canvas(800,600),createCanvas=vi.fn(),r=await encodeImageAttachment(source,{preferPng:true,createCanvas});
  expect(createCanvas).not.toHaveBeenCalled();expect(r.type).toBe('image/png');const decode=vi.fn();expect(await prepareImageAttachment(r,{decode})).toBe(r);expect(decode).not.toHaveBeenCalled();
 });
 it('prefers PNG and returns at the first size that fits',async()=>{
  const source=canvas(3000,2250),r=await encodeImageAttachment(source,{preferPng:true});expect(r.type).toBe('image/png');expect(source.toBlob).toHaveBeenCalledOnce();
 });
 it('reduces JPEG quality only after exceeding the limit',async()=>{
  const source=canvas(3000,2250,(_t,q)=>q>.75?MAX_IMAGE_SIZE_IN_BYTES+1:100);
  await encodeImageAttachment(source);expect(source.toBlob.mock.calls.map(x=>x[2])).toEqual([.85,.75]);
 });
 it('reduces dimensions if JPEG quality changes are insufficient',async()=>{
  const source=canvas(3000,2250,()=>MAX_IMAGE_SIZE_IN_BYTES+1),scratch=canvas(0,0);
  await encodeImageAttachment(source,{createCanvas:()=>scratch});expect(scratch.getContext().drawImage).toHaveBeenCalledWith(source,0,0,2400,1800);expect(source.toBlob).toHaveBeenCalledTimes(3);
 });
 it('has bounded attempts even if an encoder never returns a small enough image',async()=>{
  const source=canvas(3000,2250,()=>MAX_IMAGE_SIZE_IN_BYTES+1),scratch=canvas(0,0,()=>MAX_IMAGE_SIZE_IN_BYTES+1);
  await expect(encodeImageAttachment(source,{createCanvas:()=>scratch})).rejects.toThrow('IMAGE_TOO_LARGE');expect(source.toBlob).toHaveBeenCalledTimes(3);expect(scratch.toBlob).toHaveBeenCalledTimes(6);
 });
 it('keeps PNG transparency during resizing and uses a white JPEG fallback',async()=>{
  const source=canvas(4000,3000),scratch=canvas(0,0);await encodeImageAttachment(source,{preferPng:true,createCanvas:()=>scratch});expect(scratch.getContext().fillRect).not.toHaveBeenCalled();
  const large=canvas(3000,2250,()=>MAX_IMAGE_SIZE_IN_BYTES+1),jpeg=canvas(0,0);await encodeImageAttachment(large,{preferPng:true,createCanvas:()=>jpeg});expect(jpeg.getContext().fillRect).toHaveBeenCalled();
 });
 it('decodes with orientation and the shared 3000 limit, then releases canvas pixels',async()=>{
  const c=canvas(2000,3000),decode=vi.fn((_f,cb)=>cb(c));await prepareImageAttachment(new File(['x'],'a.jpg',{type:'image/jpeg'}),{decode});
  expect(decode.mock.calls[0][2]).toMatchObject({orientation:true,maxWidth:MAX_IMAGE_EDGE,maxHeight:MAX_IMAGE_EDGE});expect(c.width).toBe(0);
 });
 it('reports broken image decoding and cancellation',async()=>{
  await expect(prepareImageAttachment(new File(['x'],'broken.jpg'),{decode:(_f,cb)=>cb({type:'error'})})).rejects.toThrow('IMAGE_INVALID');
  const controller=new AbortController();controller.abort();await expect(encodeImageAttachment(canvas(2,2),{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 });
});
