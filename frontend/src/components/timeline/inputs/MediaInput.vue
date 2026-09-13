<template>
  <div role="group" class="media-input-group">
    <UiTooltip :text="$t('画像データを添付する')">
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

    <UiTooltip :text="$t('動画データを添付する')">
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

    <UiTooltip :text="$t('音データを添付する')">
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

    <div class="image-preview-wrapper" v-if="imageData">
      <img :src="imageData" :alt="localImageCaption || ''" />
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
        counter
        :label="`${$t('代替テキスト')} ${$t('200文字まで')}`"
        :invalid="imageCaptionError"
        :error="imageCaptionError ? $t('200文字まで') : ''"
      >
        <template #default="{ controlAttrs }">
          <textarea
            v-bind="controlAttrs"
            data-testid="media-image-caption"
            maxlength="200"
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
                <figcaption>{{ localAudioDescription }}</figcaption>
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
            :control-id="mediaId('audio_title')"
            counter
            :label="`${$t('音声のタイトル')} ${$t('200文字まで')}`"
            :invalid="audioTitleError"
            :error="audioTitleError ? $t('200文字まで') : ''"
          >
            <template #default="{ controlAttrs }">
              <textarea
                v-bind="controlAttrs"
                data-testid="media-audio-title"
                maxlength="200"
                v-model.trim="localAudioTitle"
                :disabled="sending || recording"
                @input="onAudioTitleChange"
              ></textarea>
            </template>
          </UiField>
        </div>

        <div class="edit-input-field">
          <UiField
            :control-id="mediaId('audio_description')"
            counter
            :label="`${$t('音声の説明')} ${$t('200文字まで')}`"
            :invalid="audioDescriptionError"
            :error="audioDescriptionError ? $t('200文字まで') : ''"
          >
            <template #default="{ controlAttrs }">
              <textarea
                v-bind="controlAttrs"
                data-testid="media-audio-description"
                maxlength="200"
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
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { getAudioDuration } from '@/utils/getAudioDuration';

export default {
  emits: [
    'audio-change',
    'audio-description-change',
    'audio-duration-change',
    'audio-title-change',
    'guest-attempt',
    'image-caption-change',
    'image-change',
    'remove-media',
    'video-change',
    'video-duration-change',
    'video-subtitle-change',
  ],
  name: 'MediaInput',
  components: {
    UiButton,
    UiField,
    UiIcon,
    UiTooltip,
  },
  props: {
    idPrefix: { type: String, required: true },

    locked: { type: Boolean, default: false },

    imageData: { type: String, default: null },
    imageCaption: { type: String, default: null },
    imageCaptionError: { type: Boolean, default: false },

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
      localImageCaption: this.imageCaption,
      localAudioTitle: this.audioTitle,
      localAudioDescription: this.audioDescription,
      localAudioFile: null,
    };
  },
  watch: {
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
      if (this.guard()) return;
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
  background: #000;
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
