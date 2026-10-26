import { describe,it,expect,vi,afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CameraCaptureDialog from '@/components/timeline/inputs/CameraCaptureDialog.vue';
const make=()=>mount(CameraCaptureDialog,{props:{open:true},global:{mocks:{$t:key=>key},stubs:{UiDialog:{template:'<div><slot name="title"/><slot/><slot name="actions"/></div>'}}}});
const media=()=>({getTracks:()=>[track],id:'synthetic'});
let track;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('camera capture',()=>{
 it('releases devices on close, uses video microphone only in video mode',async()=>{
  track={stop:vi.fn()};const getUserMedia=vi.fn().mockResolvedValue(media());vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();const w=make();
  await w.vm.openCamera();expect(getUserMedia.mock.calls[0][0].audio).toBe(false);
  w.vm.mode='video';await w.vm.openCamera();expect(getUserMedia.mock.calls[1][0].audio).toBe(true);w.vm.close();expect(track.stop).toHaveBeenCalledTimes(2);expect(w.emitted('close')).toHaveLength(1);w.unmount();
 });
 it('stops a late permission result after closing instead of leaking the camera',async()=>{
  track={stop:vi.fn()};let resolve;vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});const w=make();const start=w.vm.openCamera();w.vm.close();resolve(media());await start;expect(track.stop).toHaveBeenCalledOnce();expect(w.vm.stream).toBe(null);w.unmount();
 });
 it('reports permission denial without recording or changing the post',async()=>{
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockRejectedValue(new Error('denied'))}});const w=make();await w.vm.openCamera();expect(w.vm.error).toBe(true);expect(w.find('[role="alert"]').exists()).toBe(true);expect(w.emitted('capture')).toBeUndefined();w.unmount();
 });
 it('captures a JPEG and releases the camera',async()=>{
  track={stop:vi.fn()};vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue(media())}});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()});vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(cb=>cb(new Blob(['image'],{type:'image/jpeg'})));
  const w=make();await w.vm.openCamera();Object.defineProperty(w.vm.$refs.preview,'videoWidth',{value:640});Object.defineProperty(w.vm.$refs.preview,'videoHeight',{value:480});w.vm.ready=true;await w.vm.takePhoto();const result=w.emitted('capture')[0][0];expect(result.kind).toBe('image');expect(result.file.type).toBe('image/jpeg');expect(track.stop).toHaveBeenCalled();w.unmount();
 });
 it('stops video at 30 seconds and attaches the video once',async()=>{
  vi.useFakeTimers();track={stop:vi.fn()};vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue(media())}});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  class Recorder {static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['video'],{type:'video/mp4'})});this.onstop?.();}}
  vi.stubGlobal('MediaRecorder',Recorder);const w=make();w.vm.mode='video';await w.vm.openCamera();w.vm.ready=true;w.vm.toggleVideo();expect(w.vm.recording).toBe(true);w.vm.changeMode('photo');expect(w.vm.mode).toBe('video');await vi.advanceTimersByTimeAsync(30000);expect(w.emitted('capture')).toHaveLength(1);expect(w.emitted('capture')[0][0].kind).toBe('video');expect(track.stop).toHaveBeenCalled();w.unmount();vi.useRealTimers();
 });
});
