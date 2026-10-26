<template>
  <UiDialog class="camera-capture-dialog" :open="open" :title-id="titleId" :close-on-escape="!recording" :close-on-backdrop="false"
    :aria-busy="starting ? 'true' : 'false'" initial-focus="[data-camera-mode=photo]"
    @opened="openCamera" @request-close="close" @closed="dispose">
    <template #title><h2 :id="titleId">{{ $t('composerSource.camera') }}</h2></template>
    <div class="camera-capture">
      <div role="group" :aria-label="$t('composerSource.camera')" class="camera-modes">
        <UiButton data-camera-mode="photo" :aria-pressed="mode === 'photo'" :disabled="recording || starting" @click="changeMode('photo')">{{ $t('composerSource.photo') }}</UiButton>
        <UiButton :aria-pressed="mode === 'video'" :disabled="recording || starting" @click="changeMode('video')">{{ $t('composerSource.video') }}</UiButton>
        <UiButton :disabled="recording || starting" :aria-label="$t('composerSource.switchCamera')" @click="switchCamera"><UiIcon name="flip_camera_ios" /></UiButton>
      </div>
      <video ref="preview" autoplay muted playsinline :aria-label="$t('composerSource.camera')" @loadeddata="ready = true"></video>
      <div class="camera-status">
      <p v-if="starting" role="status">{{ $t('composerSource.loading') }}</p>
      <p v-if="error" role="alert">{{ $t('composerSource.cameraError') }}</p>
      <p v-if="recording" role="timer">{{ $t('composerSource.elapsed', { seconds: elapsed }) }}</p>
      <UiButton v-if="error" @click="openCamera">{{ $t('composerSource.retry') }}</UiButton>
      </div>
    </div>
    <template #actions>
      <div class="camera-actions">
        <UiButton :disabled="recording" @click="close">{{ $t('キャンセル') }}</UiButton>
        <UiButton appearance="filled" :tone="recording ? 'danger' : 'primary'" :disabled="(!ready || starting || error) && !recording"
          @click="mode === 'photo' ? takePhoto() : toggleVideo()">
          <UiIcon :name="recording ? 'stop' : mode === 'photo' ? 'photo_camera' : 'videocam'" />
          {{ $t(recording ? 'composerSource.stop' : mode === 'photo' ? 'composerSource.takePhoto' : 'composerSource.recordVideo') }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>
<script>
import { markRaw, useId } from 'vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { MAX_VIDEO_SIZE_IN_BYTES } from '@/constants/mediaConstants';
export default {
  components:{ UiDialog, UiButton, UiIcon }, props:{open:Boolean}, emits:['close','capture'],
  setup() { return { titleId:`capture-${useId()}` }; },
  data() { return { mode:'photo',facing:'environment',starting:false,ready:false,error:false,recording:false,elapsed:0,stream:null,recorder:null,timer:null,generation:0 }; },
  watch:{open(value) { if (!value) this.dispose(); }},
  beforeUnmount() { this.dispose(); },
  methods:{
    stopTracks() { this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.ready=false;if(this.$refs.preview)this.$refs.preview.srcObject=null; },
    dispose() { this.generation++;clearInterval(this.timer);this.timer=null;if(this.recorder?.state==='recording')this.recorder.stop();this.recorder=null;this.recording=false;this.starting=false;this.stopTracks(); },
    close() { if(this.recording)return;this.dispose();this.$emit('close'); },
    async openCamera() {
      this.dispose();if(!this.open)return;const generation=this.generation;this.starting=true;this.error=false;let timeout;let abandoned=false;
      try {
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera unavailable');
        const request=navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:this.facing}},audio:this.mode==='video'});
        request.then(stream=>{if(abandoned || generation!==this.generation || !this.open)stream.getTracks().forEach(t=>t.stop());},()=>{});
        const stream=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('camera timeout')),15000);})]);
        if(generation!==this.generation || !this.open)return;
        this.stream=markRaw(stream);this.$refs.preview.srcObject=stream;await this.$refs.preview.play();
      } catch { abandoned=true;if(generation===this.generation){this.error=true;this.stopTracks();} }
      finally { clearTimeout(timeout);if(generation===this.generation)this.starting=false; }
    },
    changeMode(mode) { if(this.recording || this.starting || mode===this.mode)return;this.mode=mode;this.openCamera(); },
    switchCamera() { if(this.recording || this.starting)return;this.facing=this.facing==='environment'?'user':'environment';this.openCamera(); },
    async takePhoto() {
      if(!this.ready || this.starting)return;const video=this.$refs.preview;const generation=this.generation;
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      if(!canvas.width || !canvas.height)return;
      canvas.getContext('2d').drawImage(video,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
      if(generation!==this.generation || !this.open)return;
      if(!blob){this.error=true;return;}
      this.$emit('capture',{kind:'image',file:new File([blob],`photo-${Date.now()}.jpg`,{type:'image/jpeg'})});this.close();
    },
    toggleVideo() {
      if(this.recording){this.recorder?.stop();return;}
      if(!this.ready || !this.stream || this.starting)return;
      try {
        const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
        if(!mime)throw new Error('recording unavailable');
        const recorder=markRaw(new MediaRecorder(this.stream,{mimeType:mime}));const generation=this.generation;const chunks=[];let bytes=0;let failed=false;
        recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>=MAX_VIDEO_SIZE_IN_BYTES && recorder.state==='recording')recorder.stop();}};
        recorder.onerror=()=>{failed=true;this.error=true;this.recording=false;clearInterval(this.timer);this.stopTracks();};
        recorder.onstop=()=>{
          clearInterval(this.timer);this.recording=false;
          if(failed || generation!==this.generation || !this.open)return;
          if(!bytes){this.error=true;return;}
          const type=mime.split(';')[0];const blob=new Blob(chunks,{type});
          this.$emit('capture',{kind:'video',file:new File([blob],`video-${Date.now()}.${type==='video/mp4'?'mp4':'webm'}`,{type})});this.close();
        };
        this.recorder=recorder;this.elapsed=0;recorder.start(250);this.recording=true;const started=Date.now();
        this.timer=setInterval(()=>{this.elapsed=Math.min(30,Math.floor((Date.now()-started)/1000));if(this.elapsed>=30 && recorder.state==='recording')recorder.stop();},250);
      } catch { this.error=true;this.recording=false; }
    },
  },
};
</script>
<style>
.camera-capture-dialog .ui-dialog__panel {
  width:min(960px, calc(100vw - 32px));max-width:none;
  height:calc(100dvh - 32px);max-height:none;background:#111;color:#fff;overflow:hidden;
}
.camera-capture-dialog .ui-dialog__header {
  position:absolute;inset:0 0 auto;z-index:2;min-height:56px;
  padding-top:env(safe-area-inset-top);pointer-events:none;
  background:linear-gradient(#000c,transparent);
}
.camera-capture-dialog .ui-dialog__header h2 { margin:12px;font-size:18px;color:#fff; }
.camera-capture-dialog .ui-dialog__content { padding:0;flex:1;min-height:0;overflow:hidden; }
.camera-capture-dialog .camera-capture { position:relative;width:100%;height:100%; }
.camera-capture-dialog .camera-capture video { display:block;width:100%;height:100%;background:#111;object-fit:contain; }
.camera-capture-dialog .camera-modes {
  position:absolute;inset:auto 0 calc(84px + env(safe-area-inset-bottom));z-index:2;
  display:flex;gap:8px;justify-content:center;flex-wrap:wrap;
  padding:12px max(8px, env(safe-area-inset-right)) 4px max(8px, env(safe-area-inset-left));
  background:linear-gradient(transparent,#000d);
}
.camera-capture-dialog .camera-status { position:absolute;inset:30% 16px auto;text-align:center;z-index:2; }
.camera-capture-dialog .camera-status:has(p) { background:#111e;padding:12px;border-radius:8px; }
.camera-capture-dialog .camera-status p { color:#fff;margin:0 0 8px; }
.camera-capture-dialog .ui-dialog__actions {
  position:absolute;inset:auto 0 0;z-index:2;justify-content:center;
  padding:8px max(12px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  background:#000d;
}
.camera-capture-dialog .camera-actions { display:flex;gap:12px;justify-content:center;flex-wrap:wrap; }
.camera-capture-dialog .ui-button { min-width:44px;min-height:44px;margin:4px 0; }
.camera-capture-dialog .ui-button--text { color:#fff;background:#252525; }
.camera-capture-dialog .camera-modes .ui-button[aria-pressed='true'] { background:#fff;color:#111;box-shadow:inset 0 -3px #555; }
.camera-capture-dialog .ui-button:focus-visible { outline:3px solid #ffdc64;outline-offset:3px; }
@media (max-width:767px) {
  .camera-capture-dialog .ui-dialog__panel { width:100vw;height:100dvh;margin:0;border-radius:0; }
}
@media (max-height:450px) {
  .camera-capture-dialog .camera-modes { inset:auto 0 calc(64px + env(safe-area-inset-bottom));padding-top:0; }
  .camera-capture-dialog .ui-dialog__actions { padding-top:0;padding-bottom:calc(8px + env(safe-area-inset-bottom)); }
  .camera-capture-dialog .camera-status { inset:56px 16px auto;font-size:14px; }
}
</style>
