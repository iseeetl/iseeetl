<template>
  <div role="group" class="media-input-group">
    <input ref="inputAttachment" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime,video/webm,video/ogv,audio/x-m4a,audio/m4a,audio/mp4,audio/webm,audio/ogg,audio/mpeg,audio/mp3,audio/wav,application/pdf,.pdf,.jpg,.jpeg,.png,.mp4,.mov,.webm,.ogv,.m4a,.mp3,.wav,.ogg"
      tabindex="-1" aria-hidden="true" style="display:none" :disabled="sending || recording" @change="handleSourceSelection" />
    <input ref="inputLibrary" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime,video/webm,video/ogv"
      tabindex="-1" aria-hidden="true" style="display:none" :disabled="sending || recording" @change="handleSourceSelection" />
    <input ref="inputCameraPhoto" type="file" accept="image/jpeg,image/png" capture="environment"
      tabindex="-1" aria-hidden="true" style="display:none" :disabled="sending || recording" @change="handleSourceSelection" />
    <input ref="inputCameraVideo" type="file" accept="video/mp4,video/quicktime,video/webm" capture="environment"
      tabindex="-1" aria-hidden="true" style="display:none" :disabled="sending || recording" @change="handleSourceSelection" />
    <p v-if="sourceError" role="alert">{{ $t('composerSource.unsupported') }}</p>
    <p v-if="pdfError" role="alert">{{ $t(pdfError) }}</p>
    <div v-if="pdfConverting" class="pdf-conversion" aria-busy="true">
      <p role="status">{{ $t('composerPdf.converting') }}</p>
      <UiButton @click="cancelPdf">{{ $t('キャンセル') }}</UiButton>
    </div>
    <p v-if="pdfInfo && imageData" role="status" class="pdf-notice">{{ $t('composerPdf.preview', { count: pdfInfo.pageCount, page: pdfInfo.pageNumber }) }}</p>
    <div v-if="pdfInfo && pdfSource && pdfInfo.pageCount > 1 && imageData" class="pdf-page-choice">
      <label :for="mediaId('pdf-page')">{{ $t('composerPdf.pageLabel') }}</label>
      <select v-if="pdfInfo.pageCount <= 200" :id="mediaId('pdf-page')" v-model.number="pdfPage" :disabled="sending || recording || pdfConverting || imagePreparing" @change="changePdfPage">
        <option v-for="page in pdfInfo.pageCount" :key="page" :value="page">{{ page }}</option>
      </select>
      <input v-else :id="mediaId('pdf-page')" type="number" min="1" :max="pdfInfo.pageCount" step="1" v-model.number="pdfPage" :disabled="sending || recording || pdfConverting || imagePreparing" @change="changePdfPage" />
      <span>{{ $t('composerPdf.pageTotal', { count: pdfInfo.pageCount }) }}</span>
    </div>
    <p v-if="imagePreparing" role="status">{{ $t('composerPdf.imagePreparing') }}</p>
    <UiDialog :open="attachmentMenu" :title-id="mediaId('attachment-title')" class="attachment-source-dialog" @request-close="attachmentMenu = false">
      <template #title><h2 :id="mediaId('attachment-title')">{{ $t('composerSource.fileShort') }}</h2></template>
      <div class="attachment-source-options">
        <UiButton @click="pickAttachmentSource('library')"><UiIcon name="photo_library" />{{ $t('composerSource.library') }}</UiButton>
        <UiButton @click="pickAttachmentSource('photo')"><UiIcon name="photo_camera" />{{ $t('composerSource.capturePhoto') }}</UiButton>
        <UiButton @click="pickAttachmentSource('video')"><UiIcon name="videocam" />{{ $t('composerSource.captureVideo') }}</UiButton>
        <UiButton @click="pickAttachmentSource('file')"><UiIcon name="attach_file" />{{ $t('composerPdf.files') }}</UiButton>
      </div>
      <template #actions><UiButton @click="attachmentMenu = false">{{ $t('キャンセル') }}</UiButton></template>
    </UiDialog>
    <UiTooltip v-if="!hideChoices" :text="$t('画像データを添付する')">
      <UiButton
        class="media-button"
        appearance="text"
        tone="neutral"
        iconOnly
        data-testid="media-input-image-button"
        :aria-label="$t('画像データを添付する')"
        :aria-disabled="locked ? 'true' : 'false'"
        :disabled="sending || recording"
        @click="chooseImageFile"
      >
        <UiIcon name="photo" />
      </UiButton>
    </UiTooltip>
    <input
      ref="inputImageFile"
      type="file"
      class="display-none-input"
      tabindex="-1"
      aria-hidden="true"
      :accept="allowedImageTypes"
      :disabled="sending || recording"
      @change="handleImageSelectionChange"
      style="display: none"
    />

    <UiTooltip v-if="!hideChoices" :text="$t('動画データを添付する')">
      <UiButton
        class="media-button"
        appearance="text"
        tone="neutral"
        iconOnly
        :aria-label="$t('動画データを添付する')"
        :aria-disabled="locked ? 'true' : 'false'"
        :disabled="sending || recording"
        @click="chooseVideoFile"
      >
        <UiIcon name="movie" />
      </UiButton>
    </UiTooltip>
    <input
      ref="inputVideoFile"
      type="file"
      class="display-none-input"
      tabindex="-1"
      aria-hidden="true"
      :accept="allowedVideoTypes"
      :disabled="sending || recording"
      @change="handleVideoSelectionChange"
      style="display: none"
    />

    <UiTooltip v-if="!hideChoices" :text="$t('音データを添付する')">
      <UiButton
        class="media-button"
        appearance="text"
        tone="neutral"
        iconOnly
        :aria-label="$t('音データを添付する')"
        :aria-disabled="locked ? 'true' : 'false'"
        :disabled="sending || recording"
        @click="chooseAudioFile"
      >
        <UiIcon name="music_video" />
      </UiButton>
    </UiTooltip>
    <input
      ref="inputAudioFile"
      type="file"
      class="display-none-input"
      tabindex="-1"
      aria-hidden="true"
      :accept="allowedAudioTypes"
      :disabled="sending || recording"
      @change="handleAudioSelectionChange"
      style="display: none"
    />

    <UiDialog :open="imagePreviewOpen && !!imageData" :title-id="mediaId('image-preview-title')" class="attachment-image-dialog" @request-close="imagePreviewOpen = false">
      <template #title><h2 :id="mediaId('image-preview-title')">{{ $t('画像を拡大表示') }}</h2></template>
      <div class="attachment-image-scroll" tabindex="0" role="region" :aria-label="$t('composerPdf.panImage')">
        <img class="attachment-large-image" :class="{ 'is-zoomed': imagePreviewZoom }" :src="imageData || undefined" :alt="localImageCaption || $t('投稿された画像')" />
      </div>
      <template #actions><UiButton :aria-pressed="imagePreviewZoom" @click="imagePreviewZoom = !imagePreviewZoom">{{ $t(imagePreviewZoom ? 'composerPdf.fitImage' : 'composerPdf.zoomImage') }}</UiButton><UiButton @click="imagePreviewOpen = false">{{ $t('閉じる') }}</UiButton></template>
    </UiDialog>
    <div class="image-preview-wrapper" v-if="imageData">
      <button type="button" class="image-preview-open" :aria-label="$t('画像を拡大表示')" :disabled="imagePreparing || pdfConverting" @click="imagePreviewOpen = true; imagePreviewZoom = false">
        <img :src="imageData" :alt="localImageCaption || ''" />
      </button>
      <UiButton
        class="image-remove-button media-remove-button"
        appearance="text"
        tone="neutral"
        density="dense"
        iconOnly
        :aria-label="$t('削除')"
        :aria-disabled="locked ? 'true' : 'false'"
        :disabled="sending || recording"
        @click.stop="remove('image')"
      >
        <UiIcon name="clear" />
      </UiButton>
    </div>

    <div class="edit-input-field" v-if="imageData">
      <UiField
        :control-id="mediaId('image_caption')"
        counter stacked
        :label="`${$t('代替テキスト')} ${$t('composerSource.textLimit', { count: descriptionLimit })}`"
        :invalid="imageCaptionError"
        :error="imageCaptionError ? $t('composerSource.textLimit', { count: descriptionLimit }) : ''"
      >
        <template #default="{ controlAttrs }">
          <textarea
            v-bind="controlAttrs"
            data-testid="media-image-caption"
            :maxlength="descriptionLimit"
            v-model.trim="localImageCaption"
            :disabled="sending || recording"
            @input="onImageCaptionChange"
          ></textarea>
        </template>
      </UiField>
    </div>

    <div class="video-wrapper">
      <div class="video-preview-wrapper" v-if="videoData">
        <UiButton
          class="video-remove-button media-remove-button"
          appearance="text"
          tone="neutral"
          density="dense"
          iconOnly
          :aria-label="$t('削除')"
          :aria-disabled="locked ? 'true' : 'false'"
          :disabled="sending || recording"
          @click.stop="remove('video')"
        >
          <UiIcon name="clear" />
        </UiButton>
        <div class="video-box">
          <video
            :id="mediaId('video-preview')"
            ref="videoPreview"
            data-testid="media-video-preview"
            :src="videoData"
            :aria-describedby="!videoName ? `${mediaId('video-size')} ${mediaId('video-duration')}` : null"
            preload="metadata"
            @loadedmetadata.stop="onLoadedVideoData"
            controls
          >
            <track
              v-if="videoSubtitleData"
              kind="subtitles"
              :src="videoSubtitleData"
              :srclang="currentLocale"
              default
            />
          </video>
        </div>
        <div
          v-if="!videoName"
          :id="mediaId('video-size')"
          :class="videoSize > maxVideoSize ? 'video-size-error' : ''"
        >
          {{ videoSizeText }}
        </div>
        <div
          v-if="!videoName"
          :id="mediaId('video-duration')"
          :class="videoDuration > maxVideoDuration ? 'video-duration-error' : ''"
        >
          {{ videoDurationText }}
        </div>
      </div>

      <div class="edit-input-field" v-if="videoData">
        <UiField :control-id="mediaId('video_description')" counter stacked :invalid="videoDescriptionError"
          :error="videoDescriptionError ? $t('composerSource.textLimit', { count: 2000 }) : ''"
          :label="`${$t('altText.heading')} ${$t('composerSource.textLimit', { count: descriptionLimit })}`">
          <template #default="{ controlAttrs }">
            <textarea v-bind="controlAttrs" data-testid="media-video-description" :maxlength="descriptionLimit"
              :value="videoDescription" :disabled="sending || recording"
              @input="$emit('video-description-change', $event.target.value)"></textarea>
          </template>
        </UiField>
      </div>

      <div class="edit-input-field" v-if="videoData">
        <UiButton
          appearance="filled"
          tone="primary"
          :aria-disabled="locked ? 'true' : 'false'"
          :disabled="sending || recording"
          @click="chooseVideoSubtitleFile"
        >
          {{ $t('字幕データを選択') }}
        </UiButton>
        <input
          ref="inputVideoSubtitleFile"
          type="file"
          class="display-none-input"
          tabindex="-1"
          aria-hidden="true"
          accept=".srt, .vtt"
          :disabled="sending || recording"
          @change="handleSubtitleSelectionChange"
          style="display: none"
        />
        <span v-if="videoSubtitleOriginalName">{{ videoSubtitleOriginalName }}</span>
        <span class="media-input-error" aria-live="assertive" role="alert">
          {{ videoSubtitleError ? $t('字幕データのサイズは2MB以下') : '' }}
        </span>
      </div>
    </div>

    <div class="audio-wrapper">
      <div v-if="audioData">
        <div class="audio-preview-wrapper">
          <div class="audio-remove-button-wrapper">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('削除')"
              :aria-disabled="locked ? 'true' : 'false'"
              :disabled="sending || recording"
              class="media-remove-button"
              @click.stop="remove('audio')"
            >
              <UiIcon name="clear" />
            </UiButton>
          </div>
          <div>
            <template v-if="localAudioDescription">
              <figure>
                <audio
                  ref="audioPreview"
                  :src="audioData"
                  :aria-label="localAudioTitle || null"
                  :aria-describedby="!audioName ? `${mediaId('audio-size')} ${mediaId('audio-duration')}` : null"
                  preload="metadata"
                  @loadedmetadata.stop="onLoadedAudioData"
                  controls
                ></audio>

              </figure>
            </template>
            <template v-else>
              <audio
                ref="audioPreview"
                :src="audioData"
                :aria-label="localAudioTitle || null"
                :aria-describedby="!audioName ? `${mediaId('audio-size')} ${mediaId('audio-duration')}` : null"
                preload="metadata"
                @loadedmetadata.stop="onLoadedAudioData"
                controls
              ></audio>
            </template>
          </div>
        </div>
        <div class="audio-status" v-if="!audioName">
          <div :id="mediaId('audio-size')" :class="audioSize > maxAudioSize ? 'audio-size-error' : ''">
            {{ audioSizeText }}
          </div>
          <div :id="mediaId('audio-duration')" :class="audioDuration > maxAudioDuration ? 'audio-duration-error' : ''">
            {{ audioDurationText }}
          </div>
        </div>

        <div class="edit-input-field">
          <UiField
            :control-id="mediaId('audio_description')"
            counter stacked
            :label="`${$t('altText.heading')} ${$t('composerSource.textLimit', { count: descriptionLimit })}`"
            :invalid="audioDescriptionError"
            :error="audioDescriptionError ? $t('composerSource.textLimit', { count: descriptionLimit }) : ''"
          >
            <template #default="{ controlAttrs }">
              <textarea
                v-bind="controlAttrs"
                data-testid="media-audio-description"
                :maxlength="descriptionLimit"
                v-model.trim="localAudioDescription"
                :disabled="sending || recording"
                @input="onAudioDescriptionChange"
              ></textarea>
            </template>
          </UiField>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { SUPPLEMENT_CONTENT_LIMIT } from '@/features/timeline/supplementLength';
import { markRaw } from 'vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import { pdfFirstPage, isPdfFile } from '@/features/timeline/pdfFirstPage';
import { usesAttachmentMenu, usesNativeCamera } from '@/features/timeline/mediaPicker';
import { isAllowedImageFile, isAllowedVideoFile, isAllowedAudioFile } from '@/constants/mediaConstants';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { getAudioDuration } from '@/utils/getAudioDuration';

export default {
  emits: [
    'source-busy-change',
    'audio-change',
    'audio-description-change',
    'audio-duration-change',
    'audio-title-change',
    'guest-attempt',
    'image-caption-change',
    'image-change',
    'remove-media',
    'video-description-change',
    'video-change',
    'video-duration-change',
    'video-subtitle-change',
  ],
  name: 'MediaInput',
  components: {
    UiDialog,
    UiButton,
    UiField,
    UiIcon,
    UiTooltip,
  },
  props: {
    hideChoices: { type: Boolean, default: false },
    idPrefix: { type: String, required: true },

    locked: { type: Boolean, default: false },

    imageData: { type: String, default: null },
    imagePreparing: { type: Boolean, default: false },
    imageCaption: { type: String, default: null },
    imageCaptionError: { type: Boolean, default: false },

    videoDescription: { type: String, default: null },
    videoDescriptionError: { type: Boolean, default: false },
    videoData: { type: String, default: null },
    videoSubtitleData: { type: String, default: null },
    videoSubtitleOriginalName: { type: String, default: null },
    videoSubtitleError: { type: Boolean, default: false },

    videoName: { type: String, default: null },
    videoSize: { type: Number, default: null },
    videoDuration: { type: Number, default: null },
    maxVideoSize: { type: Number, default: 0 },
    maxVideoDuration: { type: Number, default: 0 },

    audioData: { type: String, default: null },
    audioName: { type: String, default: null },
    audioTitle: { type: String, default: null },
    audioTitleError: { type: Boolean, default: false },
    audioDescription: { type: String, default: null },
    audioDescriptionError: { type: Boolean, default: false },
    audioSize: { type: Number, default: null },
    audioDuration: { type: Number, default: null },
    maxAudioSize: { type: Number, default: 0 },
    maxAudioDuration: { type: Number, default: 0 },

    currentLocale: { type: String, default: 'ja' },

    allowedImageTypes: { type: String, default: 'image/*' },
    allowedVideoTypes: { type: String, default: 'video/*' },
    allowedAudioTypes: { type: String, default: 'audio/*' },
    sending: { type: Boolean, default: false },
    recording: { type: Boolean, default: false },
  },
  data() {
    return {
      sourceError: false,
      imagePreviewOpen: false,
      imagePreviewZoom: false,
      attachmentMenu: false,
      pdfConverting: false,
      pdfError: null,
      pdfInfo: null,
      pdfSource: null,
      pdfPage: 1,
      pdfAbort: null,
      sourceGeneration: 0,
      descriptionLimit: SUPPLEMENT_CONTENT_LIMIT,
      localImageCaption: this.imageCaption,
      localAudioTitle: this.audioTitle,
      localAudioDescription: this.audioDescription,
      localAudioFile: null,
    };
  },
  beforeUnmount() { this.resetAttachment(); },
  watch: {
    sourceBusy(value) { this.$emit('source-busy-change', value); },
    imageCaption(val) {
      this.localImageCaption = val;
    },
    audioTitle(val) {
      this.localAudioTitle = val;
    },
    audioDescription(val) {
      this.localAudioDescription = val;
    },
  },
  computed: {
    sourceBusy() { return this.attachmentMenu || this.pdfConverting; },
    videoSizeText() {
      if (!this.videoSize || !this.maxVideoSize) return '';
      return (
        (this.videoSize / (1024 * 1024)).toFixed(1) + ' / ' + (this.maxVideoSize / (1024 * 1024)).toFixed(1) + ' MB'
      );
    },
    videoDurationText() {
      if (!this.videoDuration || !this.maxVideoDuration) return '';
      return this.videoDuration + ' / ' + this.maxVideoDuration + ' Sec';
    },
    audioSizeText() {
      if (!this.audioSize || !this.maxAudioSize) return '';
      return (
        (this.audioSize / (1024 * 1024)).toFixed(1) + ' / ' + (this.maxAudioSize / (1024 * 1024)).toFixed(1) + ' MB'
      );
    },
    audioDurationText() {
      if (!this.audioDuration || !this.maxAudioDuration) return '';
      return this.audioDuration + ' / ' + this.maxAudioDuration + ' Sec';
    },
  },
  methods: {
    mediaId(suffix) {
      return `${this.idPrefix}-${suffix}`;
    },
    guard() {
      if (this.locked) {
        this.$emit('guest-attempt');
        return true;
      }
      return false;
    },

    chooseCameraFile(kind = 'photo') {
      if (kind !== 'photo' && kind !== 'video') return true;
      if (!usesNativeCamera()) return false;
      if (this.sending || this.recording || this.guard()) return true;
      this.sourceError = false;
      const input = kind === 'photo' ? this.$refs.inputCameraPhoto : this.$refs.inputCameraVideo;
      input.value = '';
      // Open the native capture input directly in the initiating tap.
      input.click();
      return true;
    },
    openAttachment() {
      if (this.sending || this.recording || this.sourceBusy || this.guard()) return;
      if (usesAttachmentMenu()) this.attachmentMenu = true;
      else this.chooseSourceFile('file');
    },
    pickAttachmentSource(kind) {
      this.attachmentMenu = false;
      // Keep native input.click in the user's synchronous activation.
      if (kind === 'photo' || kind === 'video') this.chooseCameraFile(kind);
      else this.chooseSourceFile(kind);
    },
    cancelPdf() {
      this.sourceGeneration++;
      this.pdfAbort?.abort();
      this.pdfAbort = null;
      this.pdfConverting = false;
      this.pdfPage = this.pdfInfo?.pageNumber || 1;
    },
    resetAttachment() {
      this.imagePreviewOpen = false;
      this.cancelPdf();
      this.attachmentMenu = false;
      this.pdfInfo = null;
      this.pdfSource = null;
      this.pdfPage = 1;
      this.pdfError = null;
      this.sourceError = false;
    },
    changePdfPage() {
      if (!Number.isInteger(this.pdfPage) || this.pdfPage < 1 || this.pdfPage > this.pdfInfo.pageCount) {
        this.pdfPage = this.pdfInfo.pageNumber;
        this.pdfError = 'composerPdf.invalidPage';
        return;
      }
      if (this.pdfPage !== this.pdfInfo.pageNumber) return this.convertPdf(this.pdfSource, this.pdfPage, true);
    },
    async convertPdf(file, pageNumber = 1, preserveCaption = false) {
      this.cancelPdf();
      this.pdfError = null;
      const generation = this.sourceGeneration;
      const controller = markRaw(new AbortController());
      this.pdfAbort = controller;
      this.pdfConverting = true;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
      try {
        const result = await pdfFirstPage(file, { signal: controller.signal, pageNumber });
        if (generation !== this.sourceGeneration || controller.signal.aborted) return;
        this.pdfInfo = { pageCount: result.pageCount, pageNumber: result.pageNumber || pageNumber };
        this.pdfPage = this.pdfInfo.pageNumber;
        this.pdfSource = markRaw(file);
        this.$emit('image-change', result.file, { preserveCaption });
      } catch (error) {
        if (generation !== this.sourceGeneration) return;
        this.pdfPage = this.pdfInfo?.pageNumber || 1;
        if (timedOut) this.pdfError = 'composerPdf.timeout';
        else if (error.name === 'PasswordException') this.pdfError = 'composerPdf.password';
        else if (error.message === 'PDF_TOO_LARGE') this.pdfError = 'composerPdf.tooLarge';
        else this.pdfError = 'composerPdf.failed';
      } finally {
        clearTimeout(timer);
        if (generation === this.sourceGeneration) { this.pdfConverting = false; this.pdfAbort = null; }
      }
    },
    chooseSourceFile(kind = 'file') {
      if (this.sending || this.recording || this.guard()) return;
      this.sourceError = false;
      // Audio MIME types prevent Android Chrome from using its photo picker.
      const input = kind === 'library' ? this.$refs.inputLibrary : this.$refs.inputAttachment;
      input.value = ''; input.click();
    },
    async handleSourceSelection(event) {
      if (this.guard()) { event.target.value = ''; return; }
      const file = event.target.files?.[0];
      if (!file) return;
      this.sourceError = false;
      this.pdfError = null;
      if (isPdfFile(file)) return this.convertPdf(file);
      if (isAllowedImageFile(file)) { this.pdfInfo = null; this.pdfSource = null; this.$emit('image-change', file); }
      else if (isAllowedVideoFile(file)) { this.pdfInfo = null; this.pdfSource = null; this.$emit('video-change', file); }
      else if (isAllowedAudioFile(file)) { this.pdfInfo = null; this.pdfSource = null; this.$emit('audio-change', file); }
      else this.sourceError = true;
    },
    chooseImageFile() {
      if (this.guard()) return;
      this.$refs.inputImageFile.value = '';
      this.$refs.inputImageFile.click();
    },
    chooseVideoFile() {
      if (this.guard()) return;
      this.$refs.inputVideoFile.value = '';
      this.$refs.inputVideoFile.click();
    },
    chooseAudioFile() {
      if (this.guard()) return;
      this.$refs.inputAudioFile.value = '';
      this.$refs.inputAudioFile.click();
    },
    chooseVideoSubtitleFile() {
      if (this.guard()) return;
      this.$refs.inputVideoSubtitleFile.value = '';
      this.$refs.inputVideoSubtitleFile.click();
    },

    handleImageSelectionChange(inputEvent) {
      if (this.guard()) {
        inputEvent.target.value = '';
        return;
      }
      const file = inputEvent.target.files[0];
      if (file) this.$emit('image-change', file);
    },
    handleVideoSelectionChange(inputEvent) {
      if (this.guard()) {
        inputEvent.target.value = '';
        return;
      }
      const file = inputEvent.target.files[0];
      if (file) this.$emit('video-change', file);
    },
    async handleAudioSelectionChange(inputEvent) {
      if (this.guard()) {
        inputEvent.target.value = '';
        return;
      }
      const file = inputEvent.target.files[0];
      if (!file) return;

      this.localAudioFile = file;
      const sec = await getAudioDuration(file, this.audioDuration);
      if (sec > 0) this.$emit('audio-duration-change', sec);

      this.$emit('audio-change', file);
    },
    handleSubtitleSelectionChange(inputEvent) {
      if (this.guard()) {
        inputEvent.target.value = '';
        return;
      }
      const file = inputEvent.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          this.$emit('video-subtitle-change', null);
        } else {
          this.$emit('video-subtitle-change', file);
        }
      }
    },

    remove(type) {
      if (this.imagePreparing || this.pdfConverting || this.guard()) return;
      this.cancelPdf(); this.pdfInfo = null; this.pdfSource = null; this.pdfError = null;
      this.$emit('remove-media', type);
    },

    onLoadedVideoData(e) {
      const videoEl = e.target;
      if (videoEl && typeof videoEl.duration === 'number' && !isNaN(videoEl.duration)) {
        this.$emit('video-duration-change', Math.round(videoEl.duration));
      }
    },
    async onLoadedAudioData() {
      if (!(this.localAudioFile instanceof Blob)) return;
      const already = Number.isFinite(this.audioDuration) && this.audioDuration > 0;
      if (!already) {
        const sec = await getAudioDuration(this.localAudioFile, this.audioDuration);
        if (sec > 0) this.$emit('audio-duration-change', sec);
      }
    },
    onImageCaptionChange() {
      this.$emit('image-caption-change', this.localImageCaption);
    },
    onAudioTitleChange() {
      this.$emit('audio-title-change', this.localAudioTitle);
    },
    onAudioDescriptionChange() {
      this.$emit('audio-description-change', this.localAudioDescription);
    },
  },
};
</script>

<style scoped>


.edit-input-field :deep(.ui-field__label) { position:static;display:block;margin-bottom:4px; }
.edit-input-field :deep(.ui-field__counter) { position:static;display:block;height:auto;text-align:end; }
.edit-input-field textarea { min-height:76px; }
.audio-preview-wrapper figcaption { overflow-wrap:anywhere;max-width:100%; }

.media-button {
  margin: 0;
  margin-inline-end: 8px;
  padding: 2px;
  border: 1px solid #ccc;
  background: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
}
.media-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* ゲストへの案内を開けるよう、クリックを受け付けたまま無効状態を示す。 */
.media-button[aria-disabled='true'],
.ui-button[aria-disabled='true'] {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-preview-wrapper,
.video-preview-wrapper,
.audio-preview-wrapper {
  margin-top: 8px;
  position: relative;
  display: inline-block;
}

.video-wrapper {
  position: relative;
}
.video-preview-wrapper {
  margin-top: 8px;
  isolation: isolate;
}
.video-box {
  width: 200px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
}
.video-box video {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
}

.image-preview-wrapper {
  display: block;
  clear: both;
  width: 200px;
  height: 200px;
  background: transparent;
}
.image-preview-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.audio-preview-wrapper {
  padding: 8px;
  background: #000;
}
.audio-remove-button-wrapper {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  margin-bottom: 8px;
}
.audio-remove-button-wrapper .ui-button {
  margin: 0;
  background: #fff !important;
}
.audio-status {
  background: #fff;
}

.media-remove-button {
  border-radius: 50%;
}
.image-remove-button,
.video-remove-button {
  position: absolute !important;
  z-index: 1;
  top: 4px;
  inset-inline-end: 4px;
  margin: 4px !important;
  background: #fff !important;
}

.video-size-error,
.video-duration-error,
.audio-size-error,
.audio-duration-error {
  color: red;
  font-weight: 700;
}
.media-input-error {
  color: var(--ui-color-danger);
}
</style>

<style scoped>
.pdf-page-choice { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0; }
.pdf-page-choice select, .pdf-page-choice input { min-height:44px; min-width:64px; max-width:100px; font:inherit; border:1px solid currentColor; border-radius:4px; padding:6px; background:var(--color-surface, white); color:inherit; }
.pdf-page-choice select:focus-visible, .pdf-page-choice input:focus-visible { outline:3px solid #1675c9; outline-offset:2px; }

.image-preview-open { display:block; padding:0; border:0; background:none; width:100%; height:100%; cursor:zoom-in; }
.image-preview-open:focus-visible { outline:3px solid #1675c9; outline-offset:2px; }
:global(.attachment-image-dialog .ui-dialog__panel) { width:min(96vw,1100px); max-width:96vw; }
.attachment-image-scroll { max-height:70dvh; overflow:auto; }
.attachment-large-image.is-zoomed { max-width:none; }
.attachment-large-image { display:block; max-width:100%; height:auto; margin:auto; }
.attachment-source-options { display:flex; flex-direction:column; gap:8px; }
.attachment-source-options .ui-button { min-height:44px; justify-content:flex-start; }
.pdf-notice { font-size:.875rem; line-height:1.5; margin:8px 0; }
.pdf-conversion { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
</style>
