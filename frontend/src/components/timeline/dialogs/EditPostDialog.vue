<template>
  <div>
    <TimelineEditorDialog
      class="transparent-dialog"
      :visible="visible"
      title-id="edit_post_dialog_title"
      :title-text="isAnimationPost ? $t('流す') : $t('投稿')"
      :cancel-label="$t('キャンセル')"
      initial-focus="#post_content"
      data-testid="dialog-edit-post"
      :blocked="recording || sending || transcribing"
      :sending="sending"
      :progress-amount="progressAmount"
      @cancel="onPressCancelButton"
      @opened="openedDialog"
      @closed="closedDialog"
    >
      <template #mobile-actions>
        <UiButton
          v-if="!isAnimationPost"
          appearance="filled"
          tone="primary"
          icon-only
          :aria-label="$t('連続投稿')"
          :disabled="sending || recording || transcribing"
          type="button"
          @click.stop="submit(true)"
        >
          <UiIcon name="outbox_alt" family="symbols" />
        </UiButton>

        <form class="inline-form" @submit.prevent="submit()">
          <UiButton
            appearance="filled"
            tone="primary"
            icon-only
            :aria-label="isAnimationPost ? $t('流す') : $t('投稿')"
            :disabled="sending || recording || transcribing"
            data-testid="dialog-edit-post-submit"
            type="submit"
          >
            <UiIcon name="send" />
          </UiButton>
        </form>
      </template>

      <div class="edit-input-field">
        <UiField
          class="timeline-comment-field"
          :class="{ 'guest-reaction-only-field': isGuestReactionOnly }"
          control-id="post_content"
          :label="$t('コメント')"
          counter
          :invalid="v$.content.$dirty && v$.content.$invalid"
          :error="v$.content.$dirty && v$.content.maxLength.$invalid ? $t('コメントは400文字までです') : ''"
        >
          <template #default="{ controlAttrs }">
            <textarea
              dir="auto"
              v-bind="controlAttrs"
              ref="postContentRef"
              maxlength="400"
              rows="4"
              v-model.trim="content"
              :disabled="sending || isGuestReactionOnly || recording || transcribing"
              aria-required="false"
              :aria-label="isGuestReactionOnly ? $t('コメント') : undefined"
              :class="{ 'guest-reaction-textarea': isGuestReactionOnly }"
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
              v-if="showMediaInput"
              :text="transcribing ? $t('テキスト化中') : recording ? $t('録音停止') : $t('録音開始')"
            >
              <UiButton
                class="record-button"
                :class="{ 'guest-locked': isGuest }"
                appearance="text"
                :tone="recording ? 'danger' : 'primary'"
                icon-only
                :aria-disabled="isGuest ? 'true' : 'false'"
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
      <div class="edit-input-field">
        <fieldset :class="['acc-fieldset', { 'is-collapsed': !isAccordionOpen('reaction') }]">
          <legend class="acc-legend">
            <UiButton
              class="acc-legend-toggle"
              density="dense"
              icon-only
              :aria-label="$t('リアクション') + ' ' + (isAccordionOpen('reaction') ? $t('閉じる') : $t('開く'))"
              :aria-expanded="isAccordionOpen('reaction') ? 'true' : 'false'"
              :aria-controls="accIds.reaction"
              :disabled="sending || recording"
              :title="isAccordionOpen('reaction') ? $t('閉じる') : $t('開く')"
              @click.stop="toggleAccordion('reaction')"
            >
              <UiIcon :name="isAccordionOpen('reaction') ? 'expand_less' : 'expand_more'" />
            </UiButton>
            <button
              type="button"
              class="acc-legend-title acc-legend-title-button"
              :aria-expanded="isAccordionOpen('reaction') ? 'true' : 'false'"
              :aria-controls="accIds.reaction"
              :disabled="sending || recording"
              data-testid="dialog-edit-post-reaction-title-toggle"
              @click="toggleAccordion('reaction')"
            >
              {{ $t('リアクション') }}
            </button>
          </legend>

          <div class="acc-panel" :id="accIds.reaction" v-show="isAccordionOpen('reaction')">
            <div class="reaction-group">
              <UiButton
                v-for="reaction in reactionTypes"
                :key="reaction.type"
                density="dense"
                icon-only
                :aria-label="$t('リアクション追加') + ': ' + $t(reaction.type)"
                :disabled="sending || recording"
                @click="insertReaction(reaction.emoji)"
              >
                {{ reaction.emoji }}
              </UiButton>

              <!-- 「ゲストはリアクションのみ」の場合も、選択内容をクリアできるようにする。 -->
              <UiButton
                v-if="isGuestReactionOnly"
                class="reaction-clear-button"
                appearance="filled"
                tone="neutral"
                density="dense"
                :disabled="sending || recording"
                @click="clearContent"
              >
                {{ $t('クリア') }}
              </UiButton>
            </div>
          </div>
        </fieldset>
      </div>
      <div class="edit-input-field" v-if="!isGuestReactionOnly && hasQuickTextGroups">
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
                :data-testid="'dialog-edit-post-quicktext-title-toggle-' + g._id"
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
      <div class="edit-input-field" v-if="!isGuestReactionOnly">
        <fieldset :class="['acc-fieldset', { 'is-collapsed': !isAccordionOpen('tags') }]">
          <legend class="acc-legend">
            <UiButton
              class="acc-legend-toggle"
              density="dense"
              icon-only
              :aria-label="$t('タグ') + ' ' + (isAccordionOpen('tags') ? $t('閉じる') : $t('開く'))"
              :aria-expanded="isAccordionOpen('tags') ? 'true' : 'false'"
              :aria-controls="accIds.tags"
              :disabled="sending || recording"
              data-testid="dialog-edit-post-tags-toggle"
              :title="isAccordionOpen('tags') ? $t('閉じる') : $t('開く')"
              @click.stop="toggleAccordion('tags')"
            >
              <UiIcon :name="isAccordionOpen('tags') ? 'expand_less' : 'expand_more'" />
            </UiButton>
            <button
              type="button"
              class="acc-legend-title acc-legend-title-button"
              :aria-expanded="isAccordionOpen('tags') ? 'true' : 'false'"
              :aria-controls="accIds.tags"
              :disabled="sending || recording"
              data-testid="dialog-edit-post-tags-title-toggle"
              @click="toggleAccordion('tags')"
            >
              {{ $t('タグ') }}
            </button>
          </legend>

          <div class="acc-panel" :id="accIds.tags" v-show="isAccordionOpen('tags')">
            <TagSelector
              v-model="roomTags"
              :tags="selectableRoomTags"
              :locale="$i18n.locale"
              :previousTags="previousTagSelectorTags"
              :copiedTags="$store.getters.tagClipboardList"
              :sending="sending"
              :recording="recording"
            />
          </div>
        </fieldset>
      </div>
      <div class="edit-input-field" v-if="showMediaInput">
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
              data-testid="dialog-edit-post-media-toggle"
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
              data-testid="dialog-edit-post-media-title-toggle"
              @click="toggleAccordion('media')"
            >
              {{ $t('メディア') }}
            </button>
          </legend>

          <div class="acc-panel" :id="accIds.media" v-show="isAccordionOpen('media')">
            <media-input
              id-prefix="timeline-post-media"
              :locked="isGuest"
              @guest-attempt="onGuestMediaAttempt"
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
        <UiTooltip v-if="!isAnimationPost" :text="$t('ショートカットキー Ctrl + Shift + Enter')">
          <UiButton
            class="desktop-item"
            appearance="filled"
            tone="primary"
            type="button"
            :disabled="sending || recording || transcribing"
            :aria-label="`${$t('連続投稿')} ${$t('ショートカットキー Ctrl + Shift + Enter')}`"
            @click.stop="submit(true)"
          >
            <UiIcon name="outbox_alt" family="symbols" />
            {{ $t('連続投稿') }}
          </UiButton>
        </UiTooltip>
        <form class="desktop-submit-form" @submit.prevent="submit()">
          <UiTooltip :text="$t('ショートカットキー Ctrl + Enter')">
            <UiButton
              class="desktop-item"
              appearance="filled"
              tone="primary"
              :aria-label="
                isAnimationPost
                  ? `${$t('流す')} ${$t('ショートカットキー Ctrl + Enter')}`
                  : `${$t('投稿')} ${$t('ショートカットキー Ctrl + Enter')}`
              "
              data-testid="dialog-edit-post-submit"
              type="submit"
              :disabled="sending || recording || transcribing"
            >
              <UiIcon name="send" />
              <span v-if="isAnimationPost">
                {{ $t('流す') }}
              </span>
              <span v-else>
                {{ $t('投稿') }}
              </span>
            </UiButton>
          </UiTooltip>
        </form>
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

    <LoginRequiredDialog
      :dialogVisible="loginConfirmVisible"
      :show-cancel="false"
      :title="$t('ログインが必要です')"
      :confirmLabel="$t('閉じる')"
      @closed="onLoginConfirmClosed"
      @confirm="onLoginConfirmOk"
    >
    </LoginRequiredDialog>
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
import { maxLength } from '@vuelidate/validators';
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
import { REACTION_TYPES } from '@/constants/reactionTypes';

import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import MediaInput from '@/components/timeline/inputs/MediaInput.vue';

import LoginRequiredDialog from '@/components/timeline/dialogs/LoginRequiredDialog.vue';
import TimelineEditorDialog from '@/components/timeline/dialogs/TimelineEditorDialog.vue';
import TagSelector from '@/components/timeline/inputs/TagSelector.vue';
import WaveformRecord from '@/components/timeline/inputs/WaveformRecord.vue';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['close', 'doneContinuousPost', 'content-saved', 'quick-text-inserted'],
  name: 'EditPostDialog',
  setup() {
    const accordionId = useId();
    return {
      v$: useOptionsVuelidate(),
      accIds: {
        tags: `edit-post-${accordionId}-tags`,
        media: `edit-post-${accordionId}-media`,
        reaction: `edit-post-${accordionId}-reaction`,
      },
    };
  },
  components: {
    ConfirmDialog,
    MediaInput,
    TagSelector,
    LoginRequiredDialog,
    TimelineEditorDialog,
    UiButton,
    UiField,
    UiIcon,
    UiTooltip,
    WaveformRecord,
  },
  props: {
    dialogVisible: Boolean,
    isAnimationPost: Boolean, // 新規作成時の投稿種別は開いたボタンで決まり、編集時は保存済みのanimationで決まる。
    propsRoomTags: Array,
    propsPost: Object,
    targetLangs: Array,
    isGuestReactionOnly: Boolean, // 「ゲストはリアクションのみ」のルームでは、ゲストはリアクションを「流す」操作だけを行える。
    presetTagIds: { type: Array, default: () => [] },
    previousOwnPostTagIds: { type: Array, default: () => [] },
    roomQuickTextGroups: { type: Array, default: () => [] },
    roomQuickTextItemsByGroup: { type: Object, default: () => ({}) },
  },
  validations: {
    content: {
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
    reactionTypes() {
      return REACTION_TYPES;
    },
    previousTagSelectorTags() {
      if (this.propsPost) return this.$store.getters.tagList || [];
      return Array.isArray(this.previousOwnPostTagIds) ? this.previousOwnPostTagIds : [];
    },
    selectableRoomTags() {
      return Array.isArray(this.propsRoomTags) ? this.propsRoomTags : [];
    },
    submittableRoomTagIds() {
      return Array.isArray(this.roomTags) ? this.roomTags : [];
    },
    showMediaInput() {
      if (this.isAnimationPost) return false;
      if (this.propsPost && this.propsPost.animation !== null) return false;
      return true;
    },
    isGuest() {
      return !this.$store.getters.userIsLogin;
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
      postId: null,
      roomTags: [],
      content: null,
      contentSelectionStart: null,
      contentSelectionEnd: null,
      animation: null,
      keyup: [],
      postBaseline: null,
      imageName: null, // Nameは保存済みのファイル名、Dataはプレビュー用データ、Fileはアップロード待ちのファイルを表す。
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
      videoSubtitleOriginalName: null, // 表示用の元ファイル名
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

      visible: this.dialogVisible,
      confirmVisible: false,

      loginConfirmVisible: false,

      accordion: { tags: true, media: true, reaction: true },
      quickTextExpanded: Object.create(null), // グループIDごとの開閉状態（trueで開く）

      sending: false,
      progressAmount: 0,
      continuousPosting: false,
    };
  },
  methods: {
    openAndFocus() {
      this.visible = true;
    },

    openedDialog() {
      this.continuousPosting = false;
      this.postBaseline = this.propsPost ? JSON.parse(JSON.stringify(this.propsPost)) : null;

      document.addEventListener('keydown', this.handleEditorShortcut);

      if (this.propsPost !== null) {
        this.postId = this.propsPost._id;
        this.roomTags = this.propsPost.room_tags;
        this.content = this.propsPost.content;
        this.animation = this.propsPost.animation;
        this.imageName = this.propsPost.image_name;
        this.imageThumbnailName = this.propsPost.image_thumbnail_name;
        this.videoName = this.propsPost.video_name;
        this.videoThumbnailName = this.propsPost.video_thumbnail_name;
        this.audioName = this.propsPost.audio_name;

        this.imageCaption = this.propsPost.image_caption;
        this.videoSubtitleOriginalName = this.propsPost.video_subtitle_originalname;
        this.videoSubtitleName = this.propsPost.video_subtitle_name;
        this.audioTitle = this.propsPost.audio_title;
        this.audioDescription = this.propsPost.audio_description;

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
      } else {
        // 絞り込みカラムから渡されたタグを、初期選択で優先する。
        if (this.presetTagIds && this.presetTagIds.length) {
          this.roomTags = this.presetTagIds.slice();
        } else if (this.previousOwnPostTagIds && this.previousOwnPostTagIds.length) {
          this.roomTags = this.previousOwnPostTagIds.slice();
        }
      }

      // 初期フォーカスは共通ダイアログに任せ、入力状態の設定ではフォーカスを動かさない。
    },

    handleEditorShortcut(keyboardEvent) {
      if (this.sending || this.recording || this.transcribing) return;

      const isEnter = keyboardEvent.key === 'Enter' || keyboardEvent.keyCode === 13;
      const isCtrlOrCmd = keyboardEvent.ctrlKey || keyboardEvent.metaKey;

      if (isEnter && isCtrlOrCmd) {
        keyboardEvent.preventDefault();
        // 連続投稿のショートカットでも、「流す」の場合は通常の送信処理を使う。
        if (keyboardEvent.shiftKey && !this.isAnimationPost) {
          this.submit(true);
        } else {
          this.submit();
        }
      }
    },

    onQuickTextSelect({ label }) {
      if (!label) return;
      this.insertContentAtSelection(label);
    },

    // 録音と文字起こし
    async toggleRecording() {
      if (this.isGuest) {
        this.onGuestMediaAttempt();
        return;
      }
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

    getContentTextarea() {
      return this.$refs.postContentRef || null;
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

    insertReaction(emoji) {
      this.insertContentAtSelection(emoji);
    },

    clearContent() {
      this.content = '';
    },

    makeScaledProgress(start, end) {
      return (e) => {
        if (!e || !e.total) return;
        const pct = Math.floor((e.loaded * 100) / e.total);
        const scaled = Math.floor(start + (end - start) * (pct / 100));
        this.progressAmount = Math.max(0, Math.min(100, scaled));
      };
    },

    async submit(isContinuous = false) {
      if (this.recording || this.transcribing || this.sending) return;
      this.sending = true;

      this.progressAmount = 0;

      let success = false;
      let successPayload = null;
      let nextAction = null; // 送信後はcloseで閉じ、reopenで次の投稿用に開き直す。
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
          this.setSnackbar(this.$t('投稿する内容がありません'), 'alert');
          return;
        }

        if (!this.validateMedia()) return;

        // 入力とメディアの検証後に、連続投稿フラグを反映する。
        this.continuousPosting = isContinuous;
        const actionType = this.postId === null ? 'create' : 'update';
        const mediaType = this.imageFile ? 'image' : this.videoFile ? 'video' : this.audioFile ? 'audio' : null;
        const previousTagIds = Array.isArray(this.propsPost?.room_tags) ? [...this.propsPost.room_tags] : [];

        let response;
        if (this.$store.getters.userId !== null) {
          // 投稿の保存前にメディアをアップロードし、返されたファイル名を保存要求に含める。
          if (this.imageFile !== null) {
            await this.imageUpload(this.makeScaledProgress(0, 80));
            didUpload = true;
          } else if (this.videoFile || this.videoSubtitleFile) {
            await this.videoUpload(this.makeScaledProgress(0, 80));
            didUpload = true;
          } else if (this.audioFile !== null) {
            await this.audioUpload(this.makeScaledProgress(0, 80));
            didUpload = true;
          }
          response = await this.editPost(this.makeScaledProgress(didUpload ? 80 : 0, 100));
        } else {
          response = await this.editGuestPost(this.makeScaledProgress(0, 100));
        }

        successPayload = {
          contentType: 'post',
          actionType,
          presentationAnimation: response?.data?.animation,
          mediaType,
          previousTagIds,
          nextTagIds: Array.isArray(response?.data?.room_tags) ? [...response.data.room_tags] : [],
        };
        success = true;
        nextAction = this.continuousPosting ? 'reopen' : 'close';
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
        if (nextAction === 'reopen') {
          this.$emit('doneContinuousPost');
        } else if (nextAction === 'close') {
          this.visible = false;
        }
      }
    },

    editPost(onProgress) {
      // 入力をすべて削除した場合は、空文字列をnullにそろえる。
      if (this.content !== null && this.content.length === 0) {
        this.content = null;
      }

      const data = {
        room_id: this.$store.getters.roomId,
        content: this.content,
        lang: this.postId ? (this.postBaseline?.lang || this.propsPost?.lang || this.$i18n.locale) : this.$i18n.locale,
        room_tags: this.submittableRoomTagIds,
        animation: this.animation,
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
      if (this.isAnimationPost) {
        data.animation = 'move-and-erase';
      }

      const request =
        this.postId !== null
          ? chatApi.updatePost({ room_id: data.room_id, _id: this.postId,
            ...buildPostPatch(data, this.postBaseline || this.propsPost || {}) }, { onUploadProgress: onProgress })
          : chatApi.createPost({ room_id: data.room_id, ...buildPostCreate(data) }, { onUploadProgress: onProgress });

      return request
        .then((res) => {
          // 保存に成功した投稿のタグを、次の選択操作で使う持ち越しタグとして記録する。
          this.$store.dispatch('doUpdateTagList', { list: res.data.room_tags });
          return res;
        })
        .catch((e) => this.handleHttpError(e, '投稿に失敗しました'));
    },

    editGuestPost(onProgress) {
      let data = {
        floor_id: this.$store.getters.floorId,
        floor_title: this.$store.getters.floorTitle,
        room_id: this.$store.getters.roomId,
        room_title: this.$store.getters.roomTitle,
        guest_name: this.$store.getters.guestName,
        content: this.content,
        lang: this.$i18n.locale,
        room_tags: this.submittableRoomTagIds,
        animation: this.animation,
        keyup: this.keyup.join(','),
        target_langs: this.targetLangs,
      };
      if (this.isAnimationPost) data.animation = 'move-and-erase';

      return chatApi
        .createGuestPost(data, { withCredentials: true, onUploadProgress: onProgress })
        .then((res) => {
          this.$store.dispatch('doUpdateTagList', { list: res.data.room_tags });
          return res;
        })
        .catch((e) => {
          return this.handleHttpError(e, '投稿に失敗しました');
        });
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

            // 再送時の重複アップロードを防ぐため、アップロード済みのファイルを解除する。
            this.videoFile = null;
            this.videoSize = null;
            this.videoDuration = null;
          }
          if (this.videoSubtitleFile) {
            this.videoSubtitleName = res.data.video_subtitle_name;

            // 再送時の重複アップロードを防ぐため、アップロード済みのファイルを解除する。
            this.videoSubtitleFile = null;
          }
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

        if (typeof this.videoSubtitleData === 'string' && this.videoSubtitleData.startsWith('blob:')) {
          window.URL.revokeObjectURL(this.videoSubtitleData);
        }
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
      return 'acc-qt-panel-' + String(groupId);
    },
    isQuickTextOpen(groupId) {
      const v = this.quickTextExpanded[groupId];
      // 開閉状態が未設定のグループは、開いた状態にする。
      return typeof v === 'boolean' ? v : true;
    },
    toggleQuickText(groupId) {
      this.quickTextExpanded[groupId] = !this.isQuickTextOpen(groupId);
    },
    selectQuickTextItem(item) {
      const label = this.itemLabel(item);
      if (!label) return;
      this.onQuickTextSelect({ label });
      this.$emit('quick-text-inserted', {
        contentType: 'post',
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
      this.continuousPosting = false;
      this.visible = false;
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
      this.v$.$reset();

      this.postId = null;
      this.postBaseline = null;
      this.roomTags = [];
      this.content = null;
      this.animation = null;
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
      // 送信・録音・文字起こし中は入力を初期化せず、キーリスナーの解除と非表示への切り替えだけを行う。
      if (this.sending || this.recording || this.transcribing) {
        document.removeEventListener('keydown', this.handleEditorShortcut);
        this.visible = false;
        return;
      }

      // 連続投稿では再表示に備え、入力状態を維持する。
      if (this.continuousPosting) {
        document.removeEventListener('keydown', this.handleEditorShortcut);
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

      const needConfirm = this.postId === null && !((this.content === null || this.content.length === 0) && !hasMedia);

      if (needConfirm) {
        // 破棄確認ダイアログにフォーカスを残すため、入力状態の初期化は確認後に行う。
        // 破棄確認の操作と競合しないよう、投稿ダイアログのショートカットを解除する。
        document.removeEventListener('keydown', this.handleEditorShortcut);
        this.showConfirm();
        return;
      }

      document.removeEventListener('keydown', this.handleEditorShortcut);
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
      document.removeEventListener('keydown', this.handleEditorShortcut);
      this.confirmVisible = false;
    },
    closedConfirm() {
      if (!this.visible) {
        this.clearValue();
        this.$emit('close');
      }
    },

    onGuestMediaAttempt() {
      // 確認ダイアログの操作と競合しないよう、親のキーリスナーを一時解除する。
      document.removeEventListener('keydown', this.handleEditorShortcut);

      this.loginConfirmVisible = true;
    },
    onLoginConfirmClosed(payload = {}) {
      // 確認ダイアログを閉じたら、親のフォーカスとキーリスナーを復元する。
      if (this.visible) {
        document.addEventListener('keydown', this.handleEditorShortcut);
        if (payload.focusRestored === false) {
          this.$nextTick(() => {
            if (this.$refs.postContentRef && typeof this.$refs.postContentRef.focus === 'function') {
              this.$refs.postContentRef.focus();
            }
          });
        }
      }
    },
    onLoginConfirmOk() {
      this.loginConfirmVisible = false;
    },

    handleHttpError(e, defaultMsgKey = '投稿に失敗しました') {
      const message = appendApiErrorMessage(this.$t(defaultMsgKey), e, { translate: this.$t });
      this.setSnackbar(message, 'alert');
      if (e?.response?.status === 401) {
        document.removeEventListener('keydown', this.handleEditorShortcut);
      }
      handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
      throw e;
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEditorShortcut);
  },
};
</script>

<style scoped>
/* ゲストへの案内を表示できるよう、無効な見た目でもクリックを受け付ける。 */
.record-button.guest-locked {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
  border-color: #ddd;
  filter: grayscale(100%);
}

.reaction-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.reaction-clear-button {
  margin-inline-start: auto !important;
}
.guest-reaction-textarea {
  background-color: #999 !important;
  border: 1px solid #ddd !important;
}
.guest-reaction-only-field :deep(.ui-field__label){
  display: none;
}

/* 送信ボタンを包むformが、ボタンの配置に影響しないようにする。 */
.inline-form,
.desktop-submit-form {
  display: inline;
  margin: 0;
}

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
  margin-bottom: 0px;
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
