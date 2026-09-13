<template>
  <article :id="`${idPrefix}_${post._id}`" tabindex="-1" :data-timeline-item-id="post._id">
    <div class="post">
      <div class="user-icon">
        <div class="user-icon-inner">
          <button
            v-if="showUserIcon"
            type="button"
            class="user-link-button"
            @click.stop="onClickUserByPost(post)"
            :aria-label="$t('{name}で絞り込み', { name: getUsernameOrGuestname(post) })"
          >
            <UiAvatar v-if="showUserIcon && isUserIconPresent(post)">
              <img :src="getUserDisplayImagePath(post.user)" alt="" />
            </UiAvatar>
            <UiAvatar v-else-if="showUserIcon">
              <UiIcon name="person" :size="24" />
            </UiAvatar>
          </button>

          <UiTooltip
            v-if="
              ($store.getters.userRole === 'Administrator' || $store.getters.roomRole === 'FloorEditor') &&
              post.user !== undefined &&
              post.user !== null &&
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
              :data-testid="'timeline-post-kick-button-' + post._id"
              @click.stop="showEditKickedUserDialog(post.user._id, resolveUserDisplayName(post.user), $event)"
            >
              <UiIcon class="kick-icon" name="block" />
            </UiButton>
          </UiTooltip>
        </div>
      </div>
      <div class="container">
        <div class="name-created">
          <div class="name" v-if="$store.getters.displayName">
            <button type="button" class="user-name-button" dir="auto" @click.stop="onClickUserByPost(post)">
              {{ $t('{name}の投稿', { name: getUsernameOrGuestname(post) }) }}
            </button>
          </div>
          <div class="created" v-if="$store.getters.displayDate">
            {{ getLocalDateTime(post.created_at) }}
          </div>
        </div>
        <div class="text"><TimelineText :content="post.content" /></div>
        <div class="translate" dir="auto" v-if="needsTranslation(post)">
          {{ getContent(post) }}
        </div>
        <div class="tags" v-if="$store.getters.displayTag">
          <template v-for="(tagId, index) in post.room_tags" :key="index">
            <button
              v-if="isTagInRoomTags(tagId)"
              type="button"
              class="tag-button"
              dir="auto"
              @click.stop="onClickTag(tagId)"
            >
              #{{ getTagNameById(tagId) }}
            </button>
          </template>
        </div>
        <div class="image" v-if="post.image_name">
          <button
            :data-testid="'timeline-post-gallery-image-button-' + post._id"
            @click.stop="showGalleryDialog(post, $event)"
            :aria-label="$t('画像を拡大表示')"
          >
            <img
              :alt="post.image_caption ? post.image_caption : $t('投稿された画像')"
              :src="constructImagePath(post)"
            />
          </button>
        </div>
        <div class="audio" v-if="post.audio_name">
          <TimelineAudioPlayer
            :src="'/media/' + post.floor + '/' + post.room + '/' + post.audio_name"
            :file-name="post.audio_name"
            :audio-title="post.audio_title || ''"
            :description="post.audio_description || ''"
            preload="metadata"
            :download-test-id="'timeline-post-audio-download-button-' + post._id"
          />
        </div>
        <div class="video" v-if="post.video_name !== null" :class="videoThumbClass(post)">
          <button
            :data-testid="'timeline-post-gallery-video-button-' + post._id"
            :aria-label="$t('動画を再生する')"
            @click.stop="showGalleryDialog(post, $event)"
          >
            <img
              aria-hidden="true"
              :src="'/media/' + post.floor + '/' + post.room + '/' + post.video_thumbnail_name"
              alt=""
              loading="lazy"
              @load="onVideoThumbLoad($event, post)"
            />
            <UiIcon class="play-icon" name="play_arrow" :size="48" />
          </button>
        </div>
        <div v-if="post.reactions">
          <ReactionItem
            :postId="post._id"
            :replyId="null"
            :supplementId="null"
            :reactions="post.reactions ? post.reactions : []"
            :isGuestRulesAgreed="isGuestRulesAgreed"
          />
        </div>
        <div class="action" v-if="$store.getters.displayActionButton">
          <div class="reply-container">
            <UiTooltip :text="$t('返信')">
              <UiButton
                class="small-button reply-add-button"
                appearance="text"
                tone="neutral"
                density="dense"
                iconOnly
                :aria-label="$t('{count}件の返信あり 返信する', { count: formatCount(post.replies.length) }, post.replies.length)"
                data-testid="timeline-post-reply-button"
                @click.stop="showEditReplyDialog(post, null, $event)"
              >
                <UiIcon name="reply" :size="20" />
              </UiButton>
            </UiTooltip>
            <span v-if="post.replies.length > 0" aria-hidden="true" class="reply-count">{{ formatCount(post.replies.length) }}</span>
          </div>

          <div class="reaction-container">
            <div class="reaction-picker-wrapper" v-if="reactionPickerVisible">
              <ReactionPicker
                ref="reactionPicker"
                :pickerId="reactionPickerId"
                :reactionPickerVisible="reactionPickerVisible"
                :postId="post._id"
                :replyId="null"
                :supplementId="null"
                :reactions="post.reactions ? post.reactions : []"
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

          <UiTooltip v-if="$store.getters.userId !== null" :text="$t('情報付加')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('情報付加')"
              data-testid="timeline-post-supplement-button"
              @click.stop="showEditSupplementDialog(post._id, null, null, $event)"
            >
              <UiIcon name="post_add" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip
            v-if="
              (post.user !== null && post.user._id === $store.getters.userId) ||
              $store.getters.userRole === 'Administrator' ||
              $store.getters.roomRole === 'FloorEditor' ||
              $store.getters.roomRole === 'FloorMember'
            "
            :text="$t('編集')"
          >
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('編集')"
              data-testid="timeline-post-edit-button"
              @click.stop="showEditPostDialog(post, false)"
            >
              <UiIcon name="create" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip v-if="canEditTag(post.user)" :text="$t('タグ更新')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('タグ更新')"
              data-testid="timeline-post-tag-button"
              @click.stop="showEditTagDialog({ post_id: post._id, reply_id: null }, post.room_tags, $event)"
            >
              <UiIcon name="tag" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip v-if="hasCopyableTags(post)" :text="$t('タグのコピー')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('タグのコピー')"
              :title="$t('タグのコピー')"
              data-testid="timeline-post-tag-copy-button"
              @click.stop="copyTagsFromPost(post)"
            >
              <UiIcon name="content_copy" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip
            v-if="
              (post.user !== null && post.user._id === $store.getters.userId) ||
              $store.getters.userRole === 'Administrator' ||
              $store.getters.roomRole === 'FloorEditor' ||
              $store.getters.roomRole === 'FloorMember'
            "
            :text="$t('削除')"
          >
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('削除')"
              data-testid="timeline-post-delete-button"
              @click.stop="showDeletePostDialog(post, $event)"
            >
              <UiIcon name="delete" :size="20" />
            </UiButton>
          </UiTooltip>

          <div class="x-item" v-if="showExternalShareButton">
            <a href="#" @click.prevent="handleShareToX(post)" :aria-label="$t('Xへ内容をポストします')">
              <img src="/assets/image/x.svg" class="x-icon" alt="" />
            </a>
          </div>

          <UiTooltip class="post-link-tooltip" :text="$t('投稿のリンク')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('投稿のリンク')"
              @click="copyPostLink(post, $event)"
            >
              <UiIcon class="post-link" name="link" :size="20" />
            </UiButton>
          </UiTooltip>
        </div>
        <div class="supplementaries" v-if="$store.getters.displaySupplement && !hideInfo">
          <SupplementItem
            v-for="supplement in post.supplementaries"
            :key="supplement._id"
            :idPrefix="idPrefix"
            :postId="post._id"
            :replyId="null"
            :supplement="supplement"
            :isGuestRulesAgreed="isGuestRulesAgreed"
            :showUserIcon="showUserIcon"
            @showEditSupplementDialog="showEditSupplementDialog"
            @showDeleteSupplementDialog="showDeleteSupplementDialog"
            @showGalleryDialog="showGalleryDialog"
            @showEditKickedUserDialog="showEditKickedUserDialog"
            @onSuccessCreateFilter="onSuccessCreateFilter"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<script>
import { API_BASE_URL } from '@/api/apiClient';
import DateUtil from '@/utils/dateUtil.js';
import TimelineUtil from '@/features/timeline/timelineUtil.js';
import TranslationUtil from '@/utils/translationUtil';
import userDisplayMethods from '@/features/profile/userDisplayMethods';
import { formatLocaleNumber } from '@/utils/numberFormat';

import SupplementItem from '@/components/timeline/items/SupplementItem.vue';
import ReactionItem from '@/components/timeline/items/ReactionItem.vue';
import ReactionPicker from '@/components/timeline/inputs/ReactionPicker.vue';
import TimelineAudioPlayer from '@/components/timeline/TimelineAudioPlayer.vue';
import TimelineText from '@/components/timeline/TimelineText.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { showSnackbar } from '@/utils/snackbar';
import { copyText } from '@/utils/clipboard';

export default {
  emits: [
    'onSuccessCreateFilter',
    'showDeletePostDialog',
    'showDeleteSupplementDialog',
    'showEditKickedUserDialog',
    'showEditPostDialog',
    'showEditReplyDialog',
    'showEditSupplementDialog',
    'showEditTagDialog',
    'showGalleryDialog',
  ],
  name: 'PostItem',
  components: {
    SupplementItem,
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
    idPrefix: String,
    post: Object,
    tags: Array,
    isGuestRulesAgreed: Boolean,
    hideInfo: {
      type: Boolean,
      default: false,
    },
    showExternalShareButton: {
      type: Boolean,
      default: false,
    },
    showUserIcon: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      reactionPickerVisible: false,

      thumbOrientation: {}, // 投稿IDごとのサムネイルの向き（portraitは縦長、landscapeは横長）
    };
  },
  computed: {
    reactionPickerId() {
      return `${this.idPrefix}-reaction-picker-post-${this.post._id}`;
    },
  },
  methods: {
    ...userDisplayMethods,
    formatCount(count) {
      return formatLocaleNumber(count, this.$i18n?.locale);
    },
    onSuccessCreateFilter(payload) {
      this.$emit('onSuccessCreateFilter', payload);
    },
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
        displayOrder: [], // ユーザ名での絞り込みでは、タグの表示順を指定しない。
        userName,
        showRange: 'all',
      };
      const webPush = false;
      const showUserIcon = true;
      this.$emit('onSuccessCreateFilter', { conditions, webPush, showUserIcon });
    },
    onClickUserByPost(post) {
      const name = this.getUsernameOrGuestname(post);
      this.createUserFilter(name);
    },
    onVideoThumbLoad(e, post) {
      const img = e.target;
      const isPortrait = img.naturalHeight > img.naturalWidth;
      this.thumbOrientation[post._id] = isPortrait ? 'portrait' : 'landscape';
    },
    videoThumbClass(post) {
      const o = this.thumbOrientation[post._id];
      return {
        'is-portrait': o === 'portrait',
        'is-landscape': o === 'landscape' || !o, // サムネイルの向きを取得するまでは横長として表示する。
      };
    },

    onClickTag(tagId) {
      const conditions = {
        filterMode: 'include',
        keyword: null,
        keywordArray: [],
        logicalOperator: 'or',
        tags: [tagId],
        tagSearchOperator: 'or',
        noTags: false,
        animation: false,
        displayOrder: [{ key: tagId }],
        userName: null,
        showRange: 'all',
      };
      const webPush = false;

      this.$emit('onSuccessCreateFilter', { conditions, webPush });
    },

    needsTranslation(data) {
      return TranslationUtil.needsTranslation(data, this.$i18n.locale);
    },

    getContent(data) {
      return TranslationUtil.getContent(data, this.$i18n.locale);
    },

    getUsernameOrGuestname(post) {
      return this.resolveActorDisplayName(post);
    },

    isUserIconPresent(post) {
      return this.hasUserDisplayImage(post?.user);
    },

    constructImagePath(data) {
      // サムネイルがない画像では元画像を表示する。
      return TimelineUtil.constructImagePath(data.floor, data.room, data);
    },

    // 表示中にルームタグが削除される場合があるため、現在のタグ一覧で存在を確認する。
    isTagInRoomTags(tagId) {
      return TimelineUtil.isTagInRoomTags(this.tags, tagId);
    },

    getTagNameById(tagId) {
      const tag = this.tags.find((tag) => tag._id === tagId);
      return TranslationUtil.getTagName(tag, this.$i18n.locale);
    },

    getLocalDateTime(date) {
      return DateUtil.getLocalDate(date, this.$i18n.locale, 'dateTime');
    },


    showEditReplyDialog(post, reply = null, event) {
      this.$emit('showEditReplyDialog', post, reply, event);
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

    showEditSupplementDialog(postId, replyId, supplement, event) {
      this.$emit('showEditSupplementDialog', postId, replyId, supplement, event);
    },
    showDeleteSupplementDialog(postId, replyId, supplement, event) {
      this.$emit('showDeleteSupplementDialog', postId, replyId, supplement, event);
    },

    canEditTag(user) {
      if (this.$store.getters.userId === null) return false;
      if (user === null) return true;
      if (user._id !== this.$store.getters.userId) return true;
      return false;
    },
    showEditTagDialog(id, tags, event) {
      this.$emit('showEditTagDialog', id, tags, event);
    },

    getCopyableTagIds(item) {
      const roomTagIds = Array.isArray(item && item.room_tags) ? item.room_tags : [];
      const result = [];
      roomTagIds.forEach((tagId) => {
        if (this.isTagInRoomTags(tagId) && !result.includes(tagId)) {
          result.push(tagId);
        }
      });
      return result;
    },
    hasCopyableTags(item) {
      return this.getCopyableTagIds(item).length > 0;
    },
    copyTagsFromPost(post) {
      const tagIds = this.getCopyableTagIds(post);
      if (tagIds.length === 0) return;
      this.$store.dispatch('doSetTagClipboardList', { list: tagIds });
      this.setSnackbar(this.$t('タグをコピーしました'), 'status');
    },

    showEditPostDialog(post, animation = false) {
      this.$emit('showEditPostDialog', post, animation);
    },

    showDeletePostDialog(post, event) {
      this.$emit('showDeletePostDialog', post, event);
    },

    handleShareToX(post) {
      const baseUrl = API_BASE_URL || '';
      const roomUrl = baseUrl + '/floor/' + this.$store.getters.floorId + '/room/' + this.$store.getters.roomId;
      const text = post.content !== null ? post.content : '';
      const url = 'http://twitter.com/share?url=' + roomUrl + '&text=' + text + '&hashtags=' + 'iseeetl';
      window.open(url, '_blank');
    },

    showGalleryDialog(data, event) {
      this.$emit('showGalleryDialog', data, event);
    },

    showEditKickedUserDialog(id, name, event) {
      this.$emit('showEditKickedUserDialog', id, name, event);
    },

    getPostLink(post) {
      const baseUrl = API_BASE_URL || '';
      const postUrl =
        baseUrl + '/floor/' + this.$store.getters.floorId + '/room/' + this.$store.getters.roomId + '/post/' + post._id;
      return postUrl;
    },

    async copyPostLink(post, event) {
      try {
        await copyText(this.getPostLink(post));
        this.setSnackbar(this.$t('投稿のリンクをコピーしました'), 'status');
        event?.currentTarget?.focus();
      } catch {
        this.setSnackbar(this.$t('投稿のリンクをコピーするのに失敗しました'), 'alert');
      }
    },
    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },
  },
};
</script>

<style scoped>
.wrapper {
  width: 100%;
  position: relative; /* アニメーション返信を重ねる際の配置基準にする。 */
}
.post {
  display: flex;
  padding: 8px;
  width: 100%;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
  text-align: start;
  word-break: break-all;
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
  position: relative; /* 再生アイコンを中央に重ねるための配置基準にする。 */
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

@media (max-width: 480px) {
  .video {
    max-width: 100%;
  }
}

.text {
  text-align: start;
  white-space: pre-wrap;
  word-break: break-all;
}
.supplementaries {
  width: 100%;
}
.tags {
  margin: 8px 0;
}
.tag-button {
  color: rgb(195, 209, 255);
  background: transparent;
  border: none;
  font-size: inherit;
  padding: 0;
  margin-block: 0;
  margin-inline: 0 8px;
  cursor: pointer;
}

.tag-button:hover {
  color: rgb(195, 209, 255);
  opacity: 0.7;
}

.x-item {
  display: block;
  border-radius: 2px;
  padding-inline-end: 4px;
  margin-inline-start: 8px;
  height: 20px;
  width: 20px;
}
.x-icon {
  fill: #ffffff;
  width: 16px;
  height: 16px;
}
.post-link-tooltip {
  margin-inline-start: auto !important;
}
.action {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.action .ui-icon {
  color: rgb(195, 209, 255);
}
.small-button {
  transform: scale(-1, 1);
}
.reply-container {
  display: inline-block;
}
.reply-count {
  margin-inline-start: -10px;
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
.reply-animation-wrapper {
  position: absolute;
  bottom: 0;
  width: 100%;
  pointer-events: none;
}
.reply-animation-container {
  position: relative;
  width: 100%;
  pointer-events: none;
}
.animation {
  padding: 8px;
  height: 0px;
  display: flex;
  align-items: center;
  color: white;
}
.animation .ui-icon {
  color: rgb(195, 209, 255);
}
.animation-active {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  height: initial;
}

.animation-complete {
  margin-top: 0px !important;
  height: 0px !important;
}

.reply-animation {
  display: inline-flex;
  pointer-events: auto;
}
.reply-animation.animation-complete {
  margin-top: 8px !important;
  height: initial;
}
.reply-animation-translate {
  text-align: start;
  word-break: break-all;
  color: lightskyblue;
}

</style>
