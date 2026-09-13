<template>
  <article class="supplement">
    <div class="user-icon">
      <div class="user-icon-inner">
        <button
          v-if="showUserIcon"
          type="button"
          class="user-link-button"
          @click.stop="onClickUserBySupplement(supplement)"
          :aria-label="$t('{name}で絞り込み', { name: getUsernameOrGuestname(supplement) })"
        >
          <UiAvatar v-if="showUserIcon && isUserIconPresent(supplement)">
            <img :src="getUserDisplayImagePath(supplement.user)" alt="" />
          </UiAvatar>
          <UiAvatar v-else-if="showUserIcon">
            <UiIcon name="person" :size="24" />
          </UiAvatar>
        </button>

        <UiTooltip
          v-if="
            ($store.getters.userRole === 'Administrator' || $store.getters.roomRole === 'FloorEditor') &&
            supplement.user !== undefined &&
            supplement.user !== null &&
            $store.getters.displayUserKickButton
          "
          :text="$t('ユーザをキックする')"
        >
          <UiButton
            class="kick-button"
            appearance="text"
            tone="danger"
            density="dense"
            iconOnly
            :aria-label="$t('ユーザをキックする')"
            @click.stop="showEditKickedUserDialog(supplement.user._id, resolveUserDisplayName(supplement.user), $event)"
          >
            <UiIcon class="kick-icon" name="block" />
          </UiButton>
        </UiTooltip>
      </div>
    </div>
    <div class="container">
      <div class="name-created">
        <div class="name" v-if="$store.getters.displayName">
          <button type="button" class="user-name-button" dir="auto" @click.stop="onClickUserBySupplement(supplement)">
            {{ $t('{name}の付加情報', { name: resolveUserDisplayName(supplement.user) }) }}
          </button>
        </div>
        <div class="created" v-if="$store.getters.displayDate">
          {{ getLocalDateTime(supplement.created_at) }}
        </div>
      </div>
      <div class="supplement-content text"><TimelineText :content="supplement.content" /></div>
      <div class="supplement-content translate" dir="auto" v-if="needsTranslation(supplement)">
        {{ getContent(supplement) }}
      </div>
      <div class="image" v-if="supplement.image_name">
        <button @click="onPressShowSupplementMedia(supplement, $event)" :aria-label="$t('画像を拡大表示')">
          <img
            :alt="supplement.image_caption ? supplement.image_caption : ''"
            :src="constructImagePath($store.getters.floorId, $store.getters.roomId, supplement)"
          />
        </button>
      </div>
      <div class="supplement-audio" v-if="supplement.audio_name">
        <TimelineAudioPlayer
          :src="'/media/' + $store.getters.floorId + '/' + $store.getters.roomId + '/' + supplement.audio_name"
          :file-name="supplement.audio_name"
          :audio-title="supplement.audio_title || ''"
          :description="supplement.audio_description || ''"
          preload="none"
          :download-test-id="'timeline-supplement-audio-download-button-' + supplement._id"
        />
      </div>
      <div class="video" v-if="supplement.video_name" :class="videoThumbClass(supplement)">
        <button :aria-label="$t('動画を再生する')" @click.stop="onPressShowSupplementMedia(supplement, $event)">
          <img
            aria-hidden="true"
            :src="
              '/media/' + $store.getters.floorId + '/' + $store.getters.roomId + '/' + supplement.video_thumbnail_name
            "
            alt=""
            loading="lazy"
            @load="onVideoThumbLoad($event, supplement)"
          />
          <UiIcon class="play-icon" name="play_arrow" :size="48" />
        </button>
      </div>

      <div v-if="supplement.reactions">
        <ReactionItem
          :postId="postId"
          :replyId="replyId"
          :supplementId="supplement._id"
          :reactions="supplement.reactions ? supplement.reactions : []"
          :isGuestRulesAgreed="isGuestRulesAgreed"
        />
      </div>

      <div class="action" v-if="$store.getters.displayActionButton">
        <div class="reaction-container">
          <div class="reaction-picker-wrapper" v-if="reactionPickerVisible">
            <ReactionPicker
              ref="reactionPicker"
              :pickerId="reactionPickerId"
              :reactionPickerVisible="reactionPickerVisible"
              :postId="postId"
              :replyId="replyId"
              :supplementId="supplement._id"
              :reactions="supplement.reactions ? supplement.reactions : []"
              :isGuestRulesAgreed="isGuestRulesAgreed"
              @close="closeReactionPicker"
            />
          </div>
          <UiTooltip
            ref="reactionButtonTooltip"
            :text="$t('リアクション')"
            :disabled="reactionPickerVisible"
          >
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('リアクション')"
              :aria-controls="reactionPickerVisible ? reactionPickerId : null"
              :aria-expanded="reactionPickerVisible ? 'true' : 'false'"
              @click.stop="toggleReactionPicker"
            >
              <UiIcon name="add_reaction" :size="20" />
            </UiButton>
          </UiTooltip>
        </div>

        <UiTooltip v-if="isUserAllowedToEdit(supplement)" :text="$t('編集')">
          <UiButton
            appearance="text"
            tone="neutral"
            density="dense"
            iconOnly
            :aria-label="$t('編集')"
            data-testid="timeline-supplement-edit-button"
            @click.stop="onPressEditSupplementButton($event)"
          >
            <UiIcon name="edit" :size="20" />
          </UiButton>
        </UiTooltip>

        <UiTooltip v-if="isUserAllowedToEdit(supplement)" :text="$t('削除')">
          <UiButton
            appearance="text"
            tone="neutral"
            density="dense"
            iconOnly
            :aria-label="$t('削除')"
            data-testid="timeline-supplement-delete-button"
            @click.stop="onPressDeleteSupplementButton($event)"
          >
            <UiIcon name="delete" :size="20" />
          </UiButton>
        </UiTooltip>
      </div>
    </div>
  </article>
</template>

<script>
import DateUtil from '@/utils/dateUtil.js';
import TimelineUtil from '@/features/timeline/timelineUtil.js';
import TranslationUtil from '@/utils/translationUtil';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

import ReactionItem from '@/components/timeline/items/ReactionItem.vue';
import ReactionPicker from '@/components/timeline/inputs/ReactionPicker.vue';
import TimelineAudioPlayer from '@/components/timeline/TimelineAudioPlayer.vue';
import TimelineText from '@/components/timeline/TimelineText.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: [
    'onSuccessCreateFilter',
    'showDeleteSupplementDialog',
    'showEditKickedUserDialog',
    'showEditSupplementDialog',
    'showGalleryDialog',
  ],
  name: 'SupplementItem',
  components: {
    ReactionItem,
    ReactionPicker,
    TimelineAudioPlayer,
    TimelineText,
    UiAvatar,
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    idPrefix: { type: String, required: true },
    postId: String || null,
    replyId: String || null,
    supplement: Object,
    isGuestRulesAgreed: Boolean,
    showUserIcon: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      thumbOrientation: {}, // 付加情報IDごとのサムネイルの向き（portraitは縦長、landscapeは横長）

      reactionPickerVisible: false,
    };
  },
  computed: {
    reactionPickerId() {
      return `${this.idPrefix}-reaction-picker-supplement-${this.supplement._id}`;
    },
  },
  methods: {
    ...userDisplayMethods,
    createUserFilter(userName) {
      const conditions = {
        filterMode: 'include',
        keyword: null,
        keywordArray: [],
        logicalOperator: 'or',
        tags: [],
        tagSearchOperator: 'or',
        noTags: false,
        animation: false,
        displayOrder: [],
        userName,
        showRange: 'all',
      };
      const webPush = false;
      const showUserIcon = true;
      this.$emit('onSuccessCreateFilter', { conditions, webPush, showUserIcon });
    },
    onClickUserBySupplement(supp) {
      const name = this.getUsernameOrGuestname(supp);
      this.createUserFilter(name);
    },
    getUsernameOrGuestname(data) {
      const n = this.resolveActorDisplayName(data);
      if (n) return n;
      return this.$t('ゲスト');
    },

    onVideoThumbLoad(e, item) {
      const img = e.target;
      const isPortrait = img.naturalHeight > img.naturalWidth;
      this.thumbOrientation[item._id] = isPortrait ? 'portrait' : 'landscape';
    },
    videoThumbClass(item) {
      const o = this.thumbOrientation[item._id];
      return {
        'is-portrait': o === 'portrait',
        'is-landscape': o === 'landscape' || !o, // サムネイルの向きを取得するまでは横長として表示する。
      };
    },

    toggleReactionPicker() {
      const shouldOpen = !this.reactionPickerVisible;
      if (shouldOpen) {
        this.$refs.reactionButtonTooltip?.hideTooltip();
      }
      this.reactionPickerVisible = shouldOpen;
      if (shouldOpen) {
        this.$nextTick(() => {
          const picker = this.$refs.reactionPicker;
          if (picker && typeof picker.focusFirstReactionButton === 'function') {
            picker.focusFirstReactionButton();
          }
        });
      }
    },
    closeReactionPicker() {
      this.$refs.reactionButtonTooltip?.focusTrigger({ showTooltip: false });
      this.reactionPickerVisible = false;
    },

    isUserIconPresent(data) {
      return this.hasUserDisplayImage(data?.user);
    },

    needsTranslation(data) {
      return TranslationUtil.needsTranslation(data, this.$i18n.locale);
    },
    getContent(data) {
      return TranslationUtil.getContent(data, this.$i18n.locale);
    },
    constructImagePath(floorId, roomId, data) {
      return TimelineUtil.constructImagePath(floorId, roomId, data);
    },

    isUserAllowedToEdit(suplement) {
      return TimelineUtil.isUserAllowedToEdit(
        suplement,
        this.$store.getters.userId,
        this.$store.getters.userRole,
        this.$store.getters.roomRole
      );
    },

    getLocalDateTime(date) {
      const locale = this.$i18n.locale;
      return DateUtil.getLocalDate(date, locale, 'dateTime');
    },

    onPressEditSupplementButton(event) {
      this.$emit('showEditSupplementDialog', this.postId, this.replyId, this.supplement, event);
    },

    onPressDeleteSupplementButton(event) {
      this.$emit('showDeleteSupplementDialog', this.postId, this.replyId, this.supplement, event);
    },

    onPressShowSupplementMedia(supplement, event) {
      this.$emit('showGalleryDialog', supplement, event);
    },

    showEditKickedUserDialog(id, name, event) {
      this.$emit('showEditKickedUserDialog', id, name, event);
    },
  },
};
</script>

<style scoped>
.supplement {
  display: flex;
  padding: 16px 0px 0px 0px;
  width: 100%;
}

.user-icon {
  padding-inline-end: 8px;
}
.user-icon-inner {
  position: relative;
}

.kick-button {
  position: absolute;
  bottom: -12px;
  inset-inline-end: -8px;
  z-index: 10;
  margin: 0;
}
.kick-icon {
  color: #db0000 !important;
  background: #ffffff;
  border-radius: 50%;
}

.container {
  flex-grow: 1;
  max-width: 100%;
  color: white;
}

.name-created {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.name {
}
.user-name-button,
.user-link-button {
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.user-name-button:hover,
.user-name-button:active,
.user-link-button:hover,
.user-link-button:active {
  text-decoration: underline;
}
.user-name-button:focus-visible,
.user-link-button:focus-visible {
  border-radius: 4px;
}
.created {
  margin-inline-start: auto;
  color: yellow;
}
@media screen and (max-width: 896px) {
  .name-created {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .created {
    margin-bottom: 4px;
    margin-inline-start: 0;
  }
}

.translate {
  color: lightskyblue;
}

.image {
  display: inline-block;
  margin: 8px 0;
}
.image button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
.image img {
  display: block;
  width: auto;
  height: auto;
  max-width: 400px;
  max-width: min(100%, 400px);
  border-radius: 8px;
}

.video {
  display: block;
  margin: 8px 0;
  width: 100%;
  max-width: 400px;
  box-sizing: border-box;
}
.video > button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  display: block;
  width: 100%;
  position: relative;
  line-height: 0;
  cursor: pointer;
}
.video.is-portrait > button {
  aspect-ratio: 4 / 5;
}
.video.is-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
/* 横向きのサムネイルは元のアスペクト比を維持する。 */
.video.is-landscape img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}
.play-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 48px;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  padding: 4px;
  z-index: 1;
}

.supplement-title {
  word-break: break-all;
}
.text {
  text-align: start;
  white-space: pre-wrap;
  word-break: break-all;
}

.action {
  display: flex;
}
.action .ui-icon {
  color: rgb(195, 209, 255);
}
.action .ui-button--danger .ui-icon {
  color: rgb(197, 97, 154);
}

.reaction-container {
  position: relative;
  display: inline-block;
}
.reaction-picker-wrapper {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding-bottom: 8px;
}

.user-name-button,
.user-link-button {
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.user-name-button:hover,
.user-name-button:active,
.user-link-button:hover,
.user-link-button:active {
  text-decoration: underline;
}
.user-name-button:focus-visible,
.user-link-button:focus-visible {
  border-radius: 4px;
}
</style>
