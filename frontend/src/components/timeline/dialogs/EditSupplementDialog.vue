<template>
  <div>
    <TimelineEditorDialog
      class="transparent-dialog"
      :visible="visible"
      title-id="edit_supplement_dialog_title"
      :title-text="$t('付加情報')"
      :cancel-label="$t('キャンセル')"
      initial-focus="#supplement_content"
      data-testid="dialog-edit-supplement"
      :blocked="recording || sending || transcribing"
      :sending="sending"
      :progress-amount="progressAmount"
      @cancel="onPressCancelButton"
      @opened="openedDialog"
      @closed="closedDialog"
    >
      <template #mobile-actions>
        <UiButton
          appearance="filled"
          tone="primary"
          icon-only
          :aria-label="$t('決定')"
          :disabled="sending || recording || transcribing"
          @click.stop="onPressDoneButton"
        >
          <UiIcon name="done" />
        </UiButton>
      </template>

      <div class="edit-input-field">
        <UiField
          class="timeline-comment-field"
          control-id="supplement_content"
          :label="$t('コメント')"
          counter
          :invalid="v$.content.$dirty && v$.content.$invalid"
          :error="
            v$.content.$dirty
              ? v$.content.required.$invalid
                ? $t('コメントは必須です')
                : v$.content.maxLength.$invalid
                ? $t('コメントは400文字までです')
                : ''
              : ''
          "
        >
          <template #default="{ controlAttrs }">
            <textarea
              dir="auto"
              v-bind="controlAttrs"
              ref="supplementContentRef"
              maxlength="400"
              rows="4"
              v-model.trim="content"
              :disabled="sending || recording || transcribing"
              aria-required="true"
              required
              @click="updateContentSelection"
              @mouseup="updateContentSelection"
              @keyup="inputFieldKeyUp"
              @blur="onContentBlur"
            ></textarea>
            <WaveformRecord
              ref="recorder"
              v-show="waveformVisible"
              class="wave-overlay"
              @blobReady="handleBlob"
              @deviceReady="handleDeviceReady"
              @deviceError="handleDeviceError"
            />

            <UiTooltip
              v-if="$store.getters.userIsLogin"
              :text="transcribing ? $t('テキスト化中') : recording ? $t('録音停止') : $t('録音開始')"
            >
              <UiButton
                class="record-button"
                appearance="text"
                :tone="recording ? 'danger' : 'primary'"
                icon-only
                :aria-label="transcribing ? $t('テキスト化中') : recording ? $t('録音停止') : $t('録音開始')"
                :disabled="sending || transcribing"
                @click="toggleRecording"
              >
                <UiIcon :name="recording ? 'stop' : 'mic'" />
              </UiButton>
            </UiTooltip>
          </template>
        </UiField>
      </div>
      <div class="edit-input-field" v-if="hasQuickTextGroups">
        <div class="quicktext-accordion">
          <fieldset
            v-for="(g, quickTextIndex) in sortedQuickTextGroups"
            :key="'qt_group_' + g._id"
            :class="['acc-fieldset', { 'is-collapsed': !isQuickTextOpen(g._id) }]"
          >
            <legend class="acc-legend">
              <UiButton
                class="acc-legend-toggle"
                density="dense"
                icon-only
                :aria-label="quickTextToggleLabel(g, quickTextIndex)"
                :aria-expanded="isQuickTextOpen(g._id) ? 'true' : 'false'"
                :aria-controls="qtPanelId(g._id)"
                :disabled="sending || recording"
                :title="isQuickTextOpen(g._id) ? $t('閉じる') : $t('開く')"
                @click.stop="toggleQuickText(g._id)"
              >
                <UiIcon :name="isQuickTextOpen(g._id) ? 'expand_less' : 'expand_more'" />
              </UiButton>
              <button
                type="button"
                class="acc-legend-title acc-legend-title-button"
                :aria-expanded="isQuickTextOpen(g._id) ? 'true' : 'false'"
                :aria-controls="qtPanelId(g._id)"
                :disabled="sending || recording"
                :data-testid="'dialog-edit-supplement-quicktext-title-toggle-' + g._id"
                @click="toggleQuickText(g._id)"
              >
                {{ groupTitle(g) }}
              </button>
            </legend>

            <div class="acc-panel" :id="qtPanelId(g._id)" v-show="isQuickTextOpen(g._id)">
              <div class="template-button-area">
                <button
                  v-for="it in itemsFor(g._id)"
                  :key="'qt_item_' + it._id"
                  class="template-button"
                  @click="selectQuickTextItem(it)"
                  :disabled="sending || recording"
                >
                  {{ itemLabel(it) }}
                </button>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
      <div class="edit-input-field" v-if="$store.getters.userIsLogin">
        <fieldset :class="['acc-fieldset', { 'is-collapsed': !isAccordionOpen('media') }]">
          <legend class="acc-legend">
            <UiButton
              class="acc-legend-toggle"
              density="dense"
              icon-only
              :aria-label="$t('メディア') + ' ' + (isAccordionOpen('media') ? $t('閉じる') : $t('開く'))"
              :aria-expanded="isAccordionOpen('media') ? 'true' : 'false'"
              :aria-controls="accIds.media"
              :disabled="sending || recording"
              :title="isAccordionOpen('media') ? $t('閉じる') : $t('開く')"
              @click.stop="toggleAccordion('media')"
            >
              <UiIcon :name="isAccordionOpen('media') ? 'expand_less' : 'expand_more'" />
            </UiButton>
            <button
              type="button"
              class="acc-legend-title acc-legend-title-button"
              :aria-expanded="isAccordionOpen('media') ? 'true' : 'false'"
              :aria-controls="accIds.media"
              :disabled="sending || recording"
              data-testid="dialog-edit-supplement-media-title-toggle"
              @click="toggleAccordion('media')"
            >
              {{ $t('メディア') }}
            </button>
          </legend>
          <div class="acc-panel" :id="accIds.media" v-show="isAccordionOpen('media')">
            <media-input
              id-prefix="timeline-supplement-media"
              :image-data="imageData"
              :image-caption="imageCaption"
              :image-caption-error="v$.imageCaption.maxLength.$invalid"
              :video-data="videoData"
              :video-name="videoName"
              :video-size="videoSize"
              :video-duration="videoDuration"
              :max-video-size="maxVideoSize"
              :max-video-duration="maxVideoDuration"
              :video-subtitle-data="videoSubtitleData"
              :video-subtitle-original-name="videoSubtitleOriginalName"
              :video-subtitle-error="videoSubtitleFileSizeError"
              :audio-data="audioData"
              :audio-name="audioName"
              :audio-title="audioTitle"
              :audio-title-error="v$.audioTitle.maxLength.$invalid"
              :audio-description="audioDescription"
              :audio-description-error="v$.audioDescription.maxLength.$invalid"
              :audio-size="audioSize"
              :audio-duration="audioDuration"
              :max-audio-size="maxAudioSize"
              :max-audio-duration="maxAudioDuration"
              :current-locale="$i18n.locale"
              :allowed-image-types="allowedImageTypes"
              :allowed-video-types="allowedVideoTypes"
              :allowed-audio-types="allowedAudioTypes"
              :sending="sending"
              :recording="recording"
              @image-change="handleImageChange"
              @video-change="handleVideoChange"
              @audio-change="handleAudioChange"
              @remove-media="handleRemoveMedia"
              @video-subtitle-change="handleVideoSubtitleChange"
              @image-caption-change="(val) => (imageCaption = val)"
              @audio-title-change="(val) => (audioTitle = val)"
              @audio-description-change="(val) => (audioDescription = val)"
              @video-duration-change="videoDuration = $event"
              @audio-duration-change="audioDuration = $event"
            />
          </div>
        </fieldset>
      </div>
      <template #actions>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="sending || recording || transcribing"
          data-testid="dialog-edit-supplement-submit"
          @click.stop="onPressDoneButton"
        >
          <UiIcon name="done" />
          {{ $t('決定') }}
        </UiButton>
      </template>
    </TimelineEditorDialog>

    <ConfirmDialog
      :dialogVisible="confirmVisible"
      :sending="sending"
      :title="$t('破棄')"
      :message="$t('編集中のコンテンツは失われます')"
      :confirm-label="$t('破棄')"
      :cancel-label="$t('キャンセル')"
      actions-adjacent
      @confirm="onPressDoneConfirmButton"
      @cancel="onPressCancelConfirmButton"
      @close="closedConfirm"
    />
  </div>
</template>

<script>
import { useId } from 'vue';
import chatApi from '@/api/chat';
import { buildPostCreate, buildPostPatch } from '@/api/postPayload';
import uploadApi from '@/api/upload';
import { appendApiErrorMessage } from '@/api/apiClient';
import { discardUnattachedTimelineMedia } from '@/features/timeline/mediaCleanup';
import { insertTextAtSelection } from '@/features/timeline/textInsertion';
import loadImage from 'blueimp-load-image';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import {
  startRecording as startRecordingUtil,
  stopRecording as stopRecordingUtil,
  handleDeviceReady as handleDeviceReadyUtil,
  handleDeviceError as handleDeviceErrorUtil,
  handleRecordingBlob,
  transcribeAudio as transcribeAudioUtil,
} from '@/utils/recording';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE_IN_BYTES,
  MAX_VIDEO_SIZE_IN_BYTES,
  MAX_VIDEO_DURATION_IN_SECONDS,
  ALLOWED_AUDIO_TYPES,
  MAX_AUDIO_SIZE_IN_BYTES,
  MAX_AUDIO_DURATION_IN_SECONDS,
  isAllowedVideoFile,
  isAllowedAudioFile,
} from '@/constants/mediaConstants';

import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

import MediaInput from '@/components/timeline/inputs/MediaInput.vue';
import TimelineEditorDialog from '@/components/timeline/dialogs/TimelineEditorDialog.vue';
import WaveformRecord from '@/components/timeline/inputs/WaveformRecord.vue';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['close', 'content-saved', 'quick-text-inserted'],
  name: 'EditSupplementDialog',
  setup() {
    const accordionId = useId();
    return {
      v$: useOptionsVuelidate(),
      accIds: { media: `edit-supplement-${accordionId}-media` },
    };
  },
  components: {
    ConfirmDialog,
    MediaInput,
    TimelineEditorDialog,
    UiButton,
    UiField,
    UiIcon,
    UiTooltip,
    WaveformRecord,
  },
  props: {
    dialogVisible: Boolean,
    postId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    replyId: {
      validator: (prop) => typeof prop === 'string' || prop === null,
    },
    supplementValue: Object,
    targetLangs: Array,
    roomQuickTextGroups: { type: Array, default: () => [] },
    roomQuickTextItemsByGroup: { type: Object, default: () => ({}) },
  },
  validations: {
    content: {
      required,
      maxLength: maxLength(400),
    },
    imageCaption: {
      maxLength: maxLength(200),
    },
    audioTitle: {
      maxLength: maxLength(200),
    },
    audioDescription: {
      maxLength: maxLength(200),
    },
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    allowedImageTypes() {
      return ALLOWED_IMAGE_TYPES.join(',');
    },
    allowedVideoTypes() {
      return ALLOWED_VIDEO_TYPES.join(',');
    },
    allowedAudioTypes() {
      return ALLOWED_AUDIO_TYPES.join(',');
    },
    maxAudioSize() {
      return MAX_AUDIO_SIZE_IN_BYTES;
    },
    maxAudioDuration() {
      return MAX_AUDIO_DURATION_IN_SECONDS;
    },
    maxVideoSize() {
      return MAX_VIDEO_SIZE_IN_BYTES;
    },
    maxVideoDuration() {
      return MAX_VIDEO_DURATION_IN_SECONDS;
    },

    lang() {
      return (this.$i18n && this.$i18n.locale) || 'ja';
    },
    sortedQuickTextGroups() {
      const arr = Array.isArray(this.roomQuickTextGroups) ? [...this.roomQuickTextGroups] : [];
      return arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    },
    hasQuickTextGroups() {
      return this.sortedQuickTextGroups.length > 0;
    },
  },
  data() {
    return {
      postIdLocal: null,
      replyIdLocal: null,
      supplementId: null,
      content: null,
      contentSelectionStart: null,
      contentSelectionEnd: null,
      keyup: [],
      mutationBaseline: null,

      imageName: null,
      imageData: null,
      imageFile: null,
      imageThumbnailName: null,
      videoName: null,
      videoData: null,
      videoFile: null,
      videoSize: null,
      videoDuration: null,
      videoThumbnailName: null,
      audioName: null,
      audioData: null,
      audioFile: null,
      audioSize: null,
      audioDuration: null,

      imageCaption: null,
      videoSubtitleOriginalName: null,
      videoSubtitleName: null,
      videoSubtitleFile: null,
      videoSubtitleData: null,
      videoSubtitleFileSizeError: false,
      audioTitle: null,
      audioDescription: null,

      recording: false,
      transcribing: false,
      micReady: false,
      waveformVisible: false,
      recordingTimeoutId: null,

      accordion: { media: true },
      quickTextExpanded: Object.create(null), // グループIDごとの開閉状態（trueで開く）

      visible: this.dialogVisible,
      confirmVisible: false,
      sending: false,
      progressAmount: 0,
    };
  },
  methods: {
    openAndFocus() {
      this.visible = true;
    },
    openedDialog() {
      this.mutationBaseline = this.supplementValue ? JSON.parse(JSON.stringify(this.supplementValue)) : null;
      this.postIdLocal = this.postId;
      this.replyIdLocal = this.replyId;
      if (this.supplementValue) {
        this.supplementId = this.supplementValue._id;
        this.content = this.supplementValue.content;
        this.imageName = this.supplementValue.image_name;
        this.imageThumbnailName = this.supplementValue.image_thumbnail_name;
        this.videoName = this.supplementValue.video_name;
        this.videoThumbnailName = this.supplementValue.video_thumbnail_name;
        this.audioName = this.supplementValue.audio_name;

        this.imageCaption = this.supplementValue.image_caption;
        this.videoSubtitleOriginalName = this.supplementValue.video_subtitle_originalname;
        this.videoSubtitleName = this.supplementValue.video_subtitle_name;
        this.audioTitle = this.supplementValue.audio_title;
        this.audioDescription = this.supplementValue.audio_description;

        if (this.imageName) {
          this.imageData =
            '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.imageName;
        }
        if (this.videoName) {
          this.videoData =
            '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.videoName;
        }
        if (this.audioName) {
          this.audioData =
            '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.audioName;
        }
        if (this.videoSubtitleName) {
          this.videoSubtitleData =
            '/media/' + this.$store.getters.floorId + '/' + this.$store.getters.roomId + '/' + this.videoSubtitleName;
        }
      }
    },

    // 録音と文字起こし
    async toggleRecording() {
      if (this.recording) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    },

    async startRecording() {
      return startRecordingUtil(this, {
        onStartError: () => this.setSnackbar(this.$t('録音を開始できませんでした'), 'alert'),
        onStopError: () => this.setSnackbar(this.$t('録音停止に失敗しました'), 'alert'),
      });
    },

    async stopRecording() {
      return stopRecordingUtil(this, {
        onStopError: () => this.setSnackbar(this.$t('録音停止に失敗しました'), 'alert'),
      });
    },

    async handleDeviceReady() {
      handleDeviceReadyUtil(this);
    },

    async handleDeviceError() {
      handleDeviceErrorUtil(this, {
        onError: () => this.setSnackbar(this.$t('マイクへのアクセスが拒否されました'), 'alert'),
      });
    },

    async handleBlob({ blob, duration }) {
      if (blob) this.removeMedia();
      handleRecordingBlob(this, {
        blob,
        duration,
        revokeExistingAudioData: true,
        onTranscribe: this.$store.getters.openaiTranscriptionAvailable
          ? (file) => this.transcribeAudio(file)
          : undefined,
      });
    },

    async transcribeAudio(file) {
      return transcribeAudioUtil(this, {
        file,
        transcribeApi: chatApi.transcribeAudio,
        onText: (text) => {
          this.content = this.content ? this.content + '\n' + text : text;
        },
        onError: () => this.setSnackbar(this.$t('音声のテキスト化に失敗しました'), 'alert'),
      });
    },

    handleImageChange(file) {
      if (!file) return;
      this.removeMedia();
      loadImage.parseMetaData(file, () => {
        const options = { maxHeight: 1200, maxWidth: 1200, canvas: true };
        loadImage(
          file,
          (canvas) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  this.setSnackbar(this.$t('ファイルのアップロードに失敗しました'), 'alert');
                  return;
                }
                if (blob.size > MAX_IMAGE_SIZE_IN_BYTES) {
                  this.setSnackbar(this.$t('メディアのファイルサイズが上限を超えています。'), 'alert');
                  return;
                }
                if (typeof this.imageData === 'string' && this.imageData.startsWith('blob:')) {
                  window.URL.revokeObjectURL(this.imageData);
                }
                this.imageFile = blob;
                this.imageData = window.URL.createObjectURL(blob);
              },
              'image/jpeg',
              0.8
            );
          },
          options
        );
      });
    },
    handleVideoChange(file) {
      if (!file) return;
      if (!isAllowedVideoFile(file)) {
        this.setSnackbar(`${this.$t('対象ファイルではありません')} ${ALLOWED_VIDEO_TYPES.join(',')}`, 'alert');
        return;
      }
      this.removeMedia();
      this.videoData = window.URL.createObjectURL(file);
      this.videoFile = file;
      this.videoSize = file.size;
    },
    handleVideoSubtitleChange(file) {
      if (!file) {
        this.videoSubtitleFileSizeError = true;
        this.videoSubtitleFile = null;
        this.videoSubtitleOriginalName = null;
        this.videoSubtitleData = null;
        return;
      }
      this.videoSubtitleFileSizeError = false;
      if (typeof this.videoSubtitleData === 'string' && this.videoSubtitleData.startsWith('blob:')) {
        window.URL.revokeObjectURL(this.videoSubtitleData);
      }
      this.videoSubtitleFile = file;
      this.videoSubtitleData = URL.createObjectURL(file);
      const originalName = file.name;
      this.videoSubtitleOriginalName = originalName.length > 20 ? originalName.substr(0, 20) : originalName;
    },
    handleAudioChange(file) {
      if (!file) return;
      if (!isAllowedAudioFile(file)) {
        this.setSnackbar(`${this.$t('対象ファイルではありません')} ${ALLOWED_AUDIO_TYPES.join(',')}`, 'alert');
        return;
      }
      this.removeMedia();
      this.audioData = window.URL.createObjectURL(file);
      this.audioFile = file;
      this.audioSize = file.size;
    },
    handleRemoveMedia(type) {
      if (type === 'image') {
        if (typeof this.imageData === 'string' && this.imageData.startsWith('blob:')) {
          window.URL.revokeObjectURL(this.imageData);
        }
        this.imageData = null;
        this.imageFile = null;
        this.imageName = null;
        this.imageThumbnailName = null;
        this.imageCaption = null;
      } else if (type === 'video') {
        if (typeof this.videoData === 'string' && this.videoData.startsWith('blob:')) {
          window.URL.revokeObjectURL(this.videoData);
        }
        this.videoData = null;
        this.videoFile = null;
        this.videoName = null;
        this.videoThumbnailName = null;
        this.videoSize = null;
        this.videoDuration = null;
        this.videoSubtitleOriginalName = null;
        this.videoSubtitleName = null;
        this.videoSubtitleFile = null;
        this.videoSubtitleData = null;
      } else if (type === 'audio') {
        if (typeof this.audioData === 'string' && this.audioData.startsWith('blob:')) {
          window.URL.revokeObjectURL(this.audioData);
        }
        this.audioData = null;
        this.audioFile = null;
        this.audioName = null;
        this.audioSize = null;
        this.audioDuration = null;
        this.audioTitle = null;
        this.audioDescription = null;
      }
    },

    isAccordionOpen(key) {
      return !!this.accordion[key];
    },
    toggleAccordion(key) {
      this.accordion[key] = !this.isAccordionOpen(key);
    },
    groupTitle(g) {
      if (!g) return '';
      if (g.lang === this.lang) return g.title || '';
      const tr = Array.isArray(g.translations) ? g.translations.find((t) => t.lang === this.lang) : null;
      return (tr && tr.content) || g.title || '';
    },
    quickTextToggleLabel(g, index) {
      const action = this.isQuickTextOpen(g._id) ? this.$t('閉じる') : this.$t('開く');
      return `${this.groupTitle(g)} ${index + 1} ${action}`;
    },
    itemsFor(groupId) {
      const list = this.roomQuickTextItemsByGroup && this.roomQuickTextItemsByGroup[groupId];
      return Array.isArray(list) ? [...list].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    },
    itemLabel(it) {
      if (!it) return '';
      if (it.lang === this.lang) return it.label || '';
      const tr = Array.isArray(it.translations) ? it.translations.find((t) => t.lang === this.lang) : null;
      return (tr && tr.content) || it.label || '';
    },
    qtPanelId(groupId) {
      return 'acc-qt-panel-supplement-' + String(groupId);
    },
    isQuickTextOpen(groupId) {
      const v = this.quickTextExpanded[groupId];
      return typeof v === 'boolean' ? v : true; // 開閉状態が未設定のグループは、開いた状態にする。
    },
    toggleQuickText(groupId) {
      this.quickTextExpanded[groupId] = !this.isQuickTextOpen(groupId);
    },
    getContentTextarea() {
      return this.$refs.supplementContentRef || null;
    },

    updateContentSelection(event) {
      const target = event && event.target ? event.target : null;
      if (target && typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
        this.contentSelectionStart = target.selectionStart;
        this.contentSelectionEnd = target.selectionEnd;
        return;
      }

      const textarea = this.getContentTextarea();
      if (!textarea || typeof textarea.selectionStart !== 'number' || typeof textarea.selectionEnd !== 'number') return;
      this.contentSelectionStart = textarea.selectionStart;
      this.contentSelectionEnd = textarea.selectionEnd;
    },

    getContentSelection(textarea) {
      if (typeof this.contentSelectionStart === 'number' && typeof this.contentSelectionEnd === 'number') {
        return { start: this.contentSelectionStart, end: this.contentSelectionEnd };
      }
      if (!textarea || typeof textarea.selectionStart !== 'number' || typeof textarea.selectionEnd !== 'number') {
        return null;
      }
      return { start: textarea.selectionStart, end: textarea.selectionEnd };
    },

    insertContentAtSelection(text) {
      const textarea = this.getContentTextarea();
      const selection = this.getContentSelection(textarea);
      const insertion = insertTextAtSelection({
        value: this.content,
        insertText: text,
        selection,
      });
      this.content = insertion.value;
      if (!insertion.usedSelection) return;

      const nextSelection = insertion.selection;
      this.contentSelectionStart = nextSelection.start;
      this.contentSelectionEnd = nextSelection.end;
      this.$nextTick(() => {
        const latestTextarea = this.getContentTextarea();
        if (!latestTextarea) return;
        if (typeof latestTextarea.focus === 'function') latestTextarea.focus();
        if (typeof latestTextarea.setSelectionRange === 'function') {
          latestTextarea.setSelectionRange(nextSelection.start, nextSelection.end);
        }
      });
    },

    selectQuickTextItem(item) {
      const label = this.itemLabel(item);
      if (!label) return;
      this.insertContentAtSelection(label);
      this.$emit('quick-text-inserted', {
        contentType: 'supplement',
        quickTextId: item._id,
        quickTextLabel: item.label,
      });
    },

    inputFieldKeyUp(event) {
      this.keyup.push(event.key);
      this.updateContentSelection(event);
    },

    onContentBlur(event) {
      this.updateContentSelection(event);
      this.v$.content.$touch();
    },

    onPressCancelButton() {
      if (this.sending || this.recording || this.transcribing) return;
      this.visible = false;
    },

    onPressDoneButton() {
      this.submitSupplement();
    },

    makeScaledProgress(start, end) {
      return (e) => {
        if (!e || !e.total) return;
        const pct = Math.floor((e.loaded * 100) / e.total);
        const scaled = Math.floor(start + (end - start) * (pct / 100));
        this.progressAmount = Math.max(0, Math.min(100, scaled));
      };
    },

    async submitSupplement() {
      if (this.recording || this.transcribing || this.sending) return;
      this.sending = true;
      this.progressAmount = 0;
      let success = false;
      let successPayload = null;
      let didUpload = false;
      try {
        this.v$.$touch();
        if (this.v$.$invalid) return;
        const hasSomething =
          (this.content && this.content.length > 0) ||
          !!this.imageFile ||
          !!this.imageName ||
          !!this.videoFile ||
          !!this.videoName ||
          !!this.audioFile ||
          !!this.audioName;
        if (!hasSomething) {
          this.setSnackbar(this.$t('コメントは必須です'), 'alert');
          return;
        }
        if (!this.validateMedia()) return;
        const actionType = this.supplementId === null ? 'create' : 'update';
        const mediaType = this.imageFile ? 'image' : this.videoFile ? 'video' : this.audioFile ? 'audio' : null;

        const p = (s, e) => this.makeScaledProgress(s, e);

        if (this.imageFile) {
          await this.imageUpload(p(0, 80));
          didUpload = true;
        } else if (this.videoFile || this.videoSubtitleFile) {
          await this.videoUpload(p(0, 80));
          didUpload = true;
        } else if (this.audioFile) {
          await this.audioUpload(p(0, 80));
          didUpload = true;
        }

        const response = await this.editSupplement(p(didUpload ? 80 : 0, 100));
        successPayload = {
          contentType: 'supplement',
          actionType,
          presentationAnimation: response?.data?.animation,
          mediaType,
        };
        success = true;
      } catch (e) {
        const status = e?.response?.status;
        if (didUpload && status >= 400 && status < 500) {
          await discardUnattachedTimelineMedia({
            roomId: this.$store.getters.roomId,
            media: this,
          });
        }
        const isAxiosError = !!(e && (e.isAxiosError || e.response || e.request));
        // 利用者へ通知済みの通信エラーは、クリックイベントへ再送出しない。
        if (!isAxiosError) {
          throw e;
        }
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }
      if (success) {
        this.$emit('content-saved', successPayload);
        this.clearValue();
        this.closedDialog();
      }
    },

    editSupplement(onProgress) {
      if (this.content === '') this.content = null;
      let data = {
        room_id: this.$store.getters.roomId,
        post_id: this.postIdLocal,
        content: this.content,
        lang: this.supplementId ? (this.mutationBaseline?.lang || this.supplementValue?.lang || this.$i18n.locale) : this.$i18n.locale,
        image_name: this.imageName,
        image_thumbnail_name: this.imageThumbnailName,
        video_name: this.videoName,
        video_thumbnail_name: this.videoThumbnailName,
        audio_name: this.audioName,
        image_caption: this.imageCaption,
        video_subtitle_originalname: this.videoSubtitleOriginalName,
        video_subtitle_name: this.videoSubtitleName,
        audio_title: this.audioTitle,
        audio_description: this.audioDescription,
      };
      const payload = this.supplementId === null ? buildPostCreate(data) : buildPostPatch(data, this.mutationBaseline || this.supplementValue || {});
      data = { room_id: data.room_id, post_id: data.post_id, ...payload };
      if (this.replyIdLocal) data.reply_id = this.replyIdLocal;
      let request;
      if (this.replyIdLocal === null) {
        if (this.supplementId !== null) {
          data['_id'] = this.supplementId;
          request = chatApi.updateSupplement(data, { onUploadProgress: onProgress });
        } else {
          request = chatApi.createSupplement(data, { onUploadProgress: onProgress });
        }
      } else if (this.supplementId !== null) {
        data['_id'] = this.supplementId;
        request = chatApi.updateReplySupplement(data, { onUploadProgress: onProgress });
      } else {
        request = chatApi.createReplySupplement(data, { onUploadProgress: onProgress });
      }

      return request.then((res) => res).catch((e) => this.handleHttpError(e, '付加情報を保存できませんでした。'));
    },

    validateMedia() {
      if (this.videoFile) {
        if (this.videoSize > MAX_VIDEO_SIZE_IN_BYTES) {
          this.setSnackbar(this.$t('メディアのファイルサイズが上限を超えています。'), 'alert');
          return false;
        }
        if (this.videoDuration > MAX_VIDEO_DURATION_IN_SECONDS) {
          this.setSnackbar(this.$t('メディアの再生時間が上限を超えています。'), 'alert');
          return false;
        }
      }
      if (this.audioFile) {
        if (this.audioSize > MAX_AUDIO_SIZE_IN_BYTES) {
          this.setSnackbar(this.$t('メディアのファイルサイズが上限を超えています。'), 'alert');
          return false;
        }
        if (this.audioDuration > MAX_AUDIO_DURATION_IN_SECONDS) {
          this.setSnackbar(this.$t('メディアの再生時間が上限を超えています。'), 'alert');
          return false;
        }
      }
      return true;
    },

    imageUpload(onProgress) {
      let formData = new FormData();
      formData.append('room_id', this.$store.getters.roomId);
      formData.append('image_file', this.imageFile, 'image.jpg');
      return uploadApi
        .uploadTimelineImage(formData, { onUploadProgress: onProgress })
        .then((res) => {
          if (typeof this.imageData === 'string' && this.imageData.startsWith('blob:')) {
            window.URL.revokeObjectURL(this.imageData);
          }
          this.imageData = null;
          this.imageFile = null;
          this.imageName = res.data.image_name;
          this.imageThumbnailName = res.data.image_thumbnail_name;
        })
        .catch((e) => this.handleHttpError(e, 'ファイルのアップロードに失敗しました'));
    },
    videoUpload(onProgress) {
      const formData = new FormData();
      formData.append('room_id', this.$store.getters.roomId);
      if (this.videoSubtitleFile) {
        formData.append('video_subtitle_file', this.videoSubtitleFile);
      }
      if (this.videoFile) {
        formData.append('video_file', this.videoFile);
      }

      return uploadApi
        .uploadTimelineVideo(formData, { onUploadProgress: onProgress })
        .then((res) => {
          if (typeof this.videoData === 'string' && this.videoData.startsWith('blob:')) {
            window.URL.revokeObjectURL(this.videoData);
          }
          this.videoData = null;

          if (typeof this.videoSubtitleData === 'string' && this.videoSubtitleData.startsWith('blob:')) {
            window.URL.revokeObjectURL(this.videoSubtitleData);
          }
          this.videoSubtitleData = null;

          if (this.videoFile) {
            this.videoName = res.data.video_name;
            this.videoThumbnailName = res.data.video_thumbnail_name;
          }
          if (this.videoSubtitleFile) {
            this.videoSubtitleName = res.data.video_subtitle_name;
          }

          // 再送時の重複アップロードを防ぐため、アップロード済みのファイルを解除する。
          this.videoFile = null;
          this.videoSize = null;
          this.videoDuration = null;
          this.videoSubtitleFile = null;
        })
        .catch((e) => this.handleHttpError(e, 'ファイルのアップロードに失敗しました'));
    },
    audioUpload(onProgress) {
      let formData = new FormData();
      formData.append('room_id', this.$store.getters.roomId);
      formData.append('audio_file', this.audioFile);
      return uploadApi
        .uploadTimelineAudio(formData, { onUploadProgress: onProgress })
        .then((res) => {
          if (typeof this.audioData === 'string' && this.audioData.startsWith('blob:')) {
            window.URL.revokeObjectURL(this.audioData);
          }
          this.audioData = null;
          this.audioFile = null;
          this.audioName = res.data.audio_name;
        })
        .catch((e) => this.handleHttpError(e, 'ファイルのアップロードに失敗しました'));
    },

    removeMedia() {
      if (typeof this.imageData === 'string' && this.imageData.startsWith('blob:')) {
        window.URL.revokeObjectURL(this.imageData);
      }
      this.imageData = null;
      this.imageFile = null;
      this.imageName = null;
      this.imageThumbnailName = null;
      this.imageCaption = null;

      if (typeof this.videoData === 'string' && this.videoData.startsWith('blob:')) {
        window.URL.revokeObjectURL(this.videoData);
      }
      this.videoData = null;
      this.videoFile = null;
      this.videoName = null;
      this.videoThumbnailName = null;
      this.videoSize = null;
      this.videoDuration = null;

      if (typeof this.videoSubtitleData === 'string' && this.videoSubtitleData.startsWith('blob:')) {
        window.URL.revokeObjectURL(this.videoSubtitleData);
      }
      this.videoSubtitleData = null;
      this.videoSubtitleOriginalName = null;
      this.videoSubtitleName = null;
      this.videoSubtitleFile = null;

      if (typeof this.audioData === 'string' && this.audioData.startsWith('blob:')) {
        window.URL.revokeObjectURL(this.audioData);
      }
      this.audioData = null;
      this.audioFile = null;
      this.audioName = null;
      this.audioSize = null;
      this.audioDuration = null;
      this.audioTitle = null;
      this.audioDescription = null;
    },

    clearValue() {
      this.mutationBaseline = null;
      this.v$.$reset();

      this.postIdLocal = null;
      this.replyIdLocal = null;
      this.supplementId = null;
      this.content = null;
      this.keyup = [];

      this.removeMedia();

      this.imageCaption = null;
      this.videoSubtitleOriginalName = null;
      this.videoSubtitleName = null;
      this.videoSubtitleFile = null;
      this.videoSubtitleData = null;
      this.audioTitle = null;
      this.audioDescription = null;
    },

    closedDialog(payload) {
      // 送信・録音・文字起こし中は入力を初期化せず、非表示への切り替えだけを行う。
      if (this.sending || this.recording || this.transcribing) {
        this.visible = false;
        return;
      }

      const hasMedia =
        !!this.imageFile ||
        !!this.imageName ||
        !!this.videoFile ||
        !!this.videoName ||
        !!this.audioFile ||
        !!this.audioName ||
        !!this.videoSubtitleFile ||
        !!this.videoSubtitleName;

      const isNewSupplement = this.supplementId === null;
      const isContentEmpty = !this.content || this.content.length === 0;

      // 入力や添付がある新規の付加情報では、状態を初期化する前に破棄を確認する。
      if (isNewSupplement && (!isContentEmpty || hasMedia)) {
        this.showConfirm();
        return;
      }

      this.clearValue();
      this.$emit('close', payload);
    },

    showConfirm() {
      this.visible = false;
      this.confirmVisible = true;
    },
    onPressCancelConfirmButton() {
      this.visible = true;
      this.confirmVisible = false;
    },
    onPressDoneConfirmButton() {
      this.confirmVisible = false;
    },
    closedConfirm() {
      if (!this.visible) {
        this.clearValue();
        this.$emit('close');
      }
    },

    handleHttpError(e, defaultMsgKey = '付加情報を保存できませんでした。') {
      const message = appendApiErrorMessage(this.$t(defaultMsgKey), e, { translate: this.$t });
      this.setSnackbar(message, 'alert');
      handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
      throw e;
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },
  },
};
</script>

<style scoped>
.acc-fieldset {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px 8px 12px;
  margin-bottom: 8px;
}
.acc-legend {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  margin-bottom: 0;
}
.acc-legend-title {
  font-weight: 600;
}
.acc-legend-title-button {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  color: inherit;
  cursor: pointer;
  text-align: start;
}
.acc-legend-title-button:disabled {
  cursor: default;
}
.acc-legend-toggle {
  margin-inline-start: 0;
}
.acc-fieldset.is-collapsed {
  padding-block: 6px 0;
  padding-inline: 6px 8px;
  margin-bottom: 6px;
}
.acc-fieldset.is-collapsed .acc-legend {
  margin-bottom: 0;
}
.template-button-area {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.template-button {
  word-wrap: break-word;
  max-width: 240px;
  background: #eee;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
}
.template-button:hover,
.template-button:focus {
  background-color: #f2f2f2;
}
</style>
