<template>
  <article
    :class="['wrapper', needThreadLine && 'thread-line']"
    :id="`${idPrefix}_${reply._id}`"
    tabindex="-1"
    :data-timeline-item-id="reply._id"
  >
    <div class="reply">
      <div class="user-icon">
        <div class="user-icon-inner">
          <button
            type="button"
            class="user-link-button"
            @click.stop="onClickUserByReply(reply)"
            :aria-label="$t('{name}で絞り込み', { name: getUsernameOrGuestname(reply) })"
          >
            <UiAvatar v-if="showUserIcon && isUserIconPresent(reply)">
              <img :src="getUserDisplayImagePath(reply.user)" alt="" />
            </UiAvatar>
            <UiAvatar v-else-if="showUserIcon">
              <UiIcon name="person" :size="24" />
            </UiAvatar>
          </button>

          <UiTooltip
            v-if="
              ($store.getters.userRole === 'Administrator' || $store.getters.roomRole === 'FloorEditor') &&
              reply.user !== undefined &&
              reply.user !== null &&
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
              @click.stop="showEditKickedUserDialog(reply.user._id, resolveUserDisplayName(reply.user), $event)"
            >
              <UiIcon class="kick-icon" name="block" />
            </UiButton>
          </UiTooltip>
        </div>
      </div>
      <div class="container">
        <div class="name-created">
          <div class="name" v-if="$store.getters.displayName">
            <button type="button" class="user-name-button" dir="auto" @click.stop="onClickUserByReply(reply)">
              {{ $t('{name}の返信', { name: getUsernameOrGuestname(reply) }) }}
            </button>
          </div>
          <div class="created" v-if="$store.getters.displayDate">
            {{ getLocalDateTime(reply.created_at) }}
          </div>
        </div>
        <div
          class="text"
          :class="'reply-content-' + reply._id"
          v-if="reply.content !== null"
        >
          <TimelineText :content="reply.content" />
        </div>
        <div class="translate" dir="auto" v-if="needsTranslation(reply)">
          {{ getContent(reply) }}
        </div>
        <div class="tags" v-if="$store.getters.displayTag">
          <template v-for="(tagId, index) in reply.room_tags" :key="index">
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
        <div class="image" v-if="reply.image_name">
          <button @click.stop="showGalleryDialog(reply, $event)" :aria-label="$t('画像を拡大表示')">
            <img
              :alt="reply.image_caption ? reply.image_caption : $t('投稿された画像')"
              :src="constructImagePath(post.floor, post.room, reply)"
            />
          </button>
        </div>
        <div class="audio" v-if="reply.audio_name">
          <TimelineAudioPlayer
            :src="'/media/' + post.floor + '/' + post.room + '/' + reply.audio_name"
            :file-name="reply.audio_name"
            :audio-title="reply.audio_title || ''"
            :description="reply.audio_description || ''"
            preload="none"
            :download-test-id="'timeline-reply-audio-download-button-' + reply._id"
          />
        </div>
        <div class="video" v-if="reply.video_name !== null" :class="videoThumbClass(reply)">
          <button :aria-label="$t('動画を再生する')" @click.stop="showGalleryDialog(reply, $event)">
            <img
              aria-hidden="true"
              :src="'/media/' + post.floor + '/' + post.room + '/' + reply.video_thumbnail_name"
              alt=""
              loading="lazy"
              @load="onVideoThumbLoad($event, reply)"
            />
            <UiIcon class="play-icon" name="play_arrow" :size="48" />
          </button>
        </div>

        <div v-if="reply.reactions">
          <ReactionItem
            :postId="post._id"
            :replyId="reply._id"
            :supplementId="null"
            :reactions="reply.reactions ? reply.reactions : []"
            :isGuestRulesAgreed="isGuestRulesAgreed"
          />
        </div>

        <div class="action" v-if="$store.getters.displayActionButton">
          <div class="reply-container">
            <UiTooltip :text="$t('返信')">
              <UiButton
                style="transform: scale(-1, 1)"
                appearance="text"
                tone="neutral"
                density="dense"
                iconOnly
                :aria-label="$t('返信')"
                :class="'reply-add-button-' + post._id"
                data-testid="timeline-reply-reply-button"
                @click.stop="showEditReplyDialog(post, null, $event)"
              >
                <UiIcon name="reply" :size="20" />
              </UiButton>
            </UiTooltip>
          </div>

          <div class="reaction-container">
            <div class="reaction-picker-wrapper" v-if="reactionPickerVisible">
              <ReactionPicker
                ref="reactionPicker"
                :pickerId="reactionPickerId"
                :reactionPickerVisible="reactionPickerVisible"
                :postId="post._id"
                :replyId="reply._id"
                :supplementId="null"
                :reactions="reply.reactions ? reply.reactions : []"
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
              data-testid="timeline-reply-supplement-button"
              @click.stop="showEditSupplementDialog(post._id, reply._id, null, $event)"
            >
              <UiIcon name="post_add" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip
            v-if="
              (reply.user !== null && reply.user._id === $store.getters.userId) ||
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
              data-testid="timeline-reply-edit-button"
              @click.stop="showEditReplyDialog(post, reply, $event)"
            >
              <UiIcon name="create" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip v-if="canEditTag(reply.user)" :text="$t('タグ更新')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('タグ更新')"
              data-testid="timeline-reply-tag-button"
              @click.stop="showEditTagDialog({ post_id: post._id, reply_id: reply._id }, reply.room_tags, $event)"
            >
              <UiIcon name="tag" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip v-if="hasCopyableTags(reply)" :text="$t('タグのコピー')">
            <UiButton
              appearance="text"
              tone="neutral"
              density="dense"
              iconOnly
              :aria-label="$t('タグのコピー')"
              :title="$t('タグのコピー')"
              data-testid="timeline-reply-tag-copy-button"
              @click.stop="copyTagsFromReply(reply)"
            >
              <UiIcon name="content_copy" :size="20" />
            </UiButton>
          </UiTooltip>

          <UiTooltip
            v-if="
              (reply.user !== null && reply.user._id === $store.getters.userId) ||
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
              data-testid="timeline-reply-delete-button"
              @click.stop="showDeleteReplyDialog(post._id, reply, $event)"
            >
              <UiIcon name="delete" :size="20" />
            </UiButton>
          </UiTooltip>
        </div>
        <div class="supplementaries" v-if="$store.getters.displaySupplement && !hideInfo">
          <SupplementItem
            v-for="supplement in reply.supplementaries"
            :key="supplement._id"
            :idPrefix="idPrefix"
            :postId="post._id"
            :replyId="reply._id"
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
import DateUtil from '@/utils/dateUtil.js';
import TimelineUtil from '@/features/timeline/timelineUtil.js';
import TranslationUtil from '@/utils/translationUtil';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

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

export default {
  emits: [
    'onSuccessCreateFilter',
    'showDeleteReplyDialog',
    'showDeleteSupplementDialog',
    'showEditKickedUserDialog',
    'showEditReplyDialog',
    'showEditSupplementDialog',
    'showEditTagDialog',
    'showGalleryDialog',
  ],
  name: 'ReplyItem',
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
    reply: Object,
    tags: Array,
    isGuestRulesAgreed: Boolean,
    hideInfo: {
      type: Boolean,
      default: false,
    },
    needThreadLine: {
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
      thumbOrientation: {}, // 返信IDごとのサムネイルの向き（portraitは縦長、landscapeは横長）

      reactionPickerVisible: false,
    };
  },
  computed: {
    reactionPickerId() {
      return `${this.idPrefix}-reaction-picker-reply-${this.reply._id}`;
    },
  },
  methods: {
    ...userDisplayMethods,
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
        displayOrder: [],
        userName,
        showRange: 'all',
      };
      const webPush = false;
      const showUserIcon = true;
      this.$emit('onSuccessCreateFilter', { conditions, webPush, showUserIcon });
    },
    onClickUserByReply(reply) {
      const name = this.getUsernameOrGuestname(reply);
      this.createUserFilter(name);
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

    getUsernameOrGuestname(post) {
      return this.resolveActorDisplayName(post);
    },

    isUserIconPresent(post) {
      return this.hasUserDisplayImage(post?.user);
    },

    constructImagePath(floorId, roomId, data) {
      // サムネイルがない画像では元画像を表示する。
      return TimelineUtil.constructImagePath(floorId, roomId, data);
    },

    needsTranslation(data) {
      return TranslationUtil.needsTranslation(data, this.$i18n.locale);
    },
    getContent(data) {
      return TranslationUtil.getContent(data, this.$i18n.locale);
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
      const locale = this.$i18n.locale;
      return DateUtil.getLocalDate(date, locale, 'dateTime');
    },


    showEditTagDialog(id, tags, event) {
      this.$emit('showEditTagDialog', id, tags, event);
    },
    canEditTag(user) {
      if (this.$store.getters.userId === null) return false;
      if (user === null) return true;
      if (user._id !== this.$store.getters.userId) return true;
      return false;
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
    copyTagsFromReply(reply) {
      const tagIds = this.getCopyableTagIds(reply);
      if (tagIds.length === 0) return;
      this.$store.dispatch('doSetTagClipboardList', { list: tagIds });
      this.setSnackbar(this.$t('タグをコピーしました'), 'status');
    },

    showEditReplyDialog(post, reply, event) {
      this.$emit('showEditReplyDialog', post, reply, event);
    },
    showDeleteReplyDialog(postId, reply, event) {
      this.$emit('showDeleteReplyDialog', postId, reply, event);
    },

    showEditSupplementDialog(postId, replyId, supplement = null, event) {
      this.$emit('showEditSupplementDialog', postId, replyId, supplement, event);
    },
    showDeleteSupplementDialog(postId, replyId, supplement, event) {
      this.$emit('showDeleteSupplementDialog', postId, replyId, supplement, event);
    },

    showGalleryDialog(reply, event) {
      this.$emit('showGalleryDialog', reply, event);
    },

    showEditKickedUserDialog(id, name, event) {
      this.$emit('showEditKickedUserDialog', id, name, event);
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
  position: relative;
}

.thread-line {
  --pt: 16px; /* 行の上下余白 */
  --av: 40px; /* アイコンの一辺 */
  --x: 27px; /* 縦線を描く横位置 */

  position: relative;
  padding-inline-start: calc(var(--pt) + var(--av));
}

.thread-line::before {
  content: '';
  position: absolute;
  inset-inline-start: var(--x);
  top: calc(var(--pt) + var(--av) / 2); /* アイコンの中心から線を描く。 */
  bottom: calc(-1 * (var(--pt) + var(--av) / 2)); /* 次の行のアイコン中央まで線を延ばす。 */
  width: 2px;
  background: #999;
}

.thread-line {
  --ln: 2px;
}

/* 縦線の中心とアイコンの中心を横線で結ぶ。 */
.thread-line .reply::after {
  content: '';
  position: absolute;

  inset-inline-start: calc(var(--x) + (var(--ln, 2px) / 2) - (var(--pt) + var(--av)));

  /* 行の余白とアイコン幅を足した長さにする。 */
  width: calc(var(--pt) + var(--av) + var(--av) / 2 - (var(--x) + var(--ln, 2px) / 2));

  top: calc(var(--pt) + var(--av) / 2);

  height: 2px;
  background: #999;
  z-index: 0;
  pointer-events: none;
}

.reply {
  display: flex;
  padding-block: 16px 0;
  padding-inline: 0 8px;
  width: 100%;
  position: relative; /* アイコン同士を結ぶ線の配置基準にする。 */
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
.user-icon {
  padding-inline-end: 8px;
  z-index: 2;
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
  flex: 1;
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

.text {
  text-align: start;
  white-space: pre-wrap;
  word-break: break-all;
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
  margin: 0;
  margin-inline-end: 8px;
  cursor: pointer;
}

.tag-button:hover {
  color: rgb(195, 209, 255);
  opacity: 0.7;
}

.action {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.action .ui-icon {
  color: rgb(195, 209, 255);
}
.action .ui-button--danger .ui-icon {
  color: rgb(197, 97, 154);
}

</style>
