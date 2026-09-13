<template>
  <div :class="['wrapper', 'animation-wrapper', needThreadLine && 'thread-line']">
    <div
      class="animation reply-animation"
      :data-reply-id="reply._id"
      :data-column-index="columnIndex"
      @click.stop="onAnimationClicked($event)"
    >
      <button
        type="button"
        class="animation-content"
        :disabled="!animationEnabled || (!isRunning && !animationPaused)"
        :aria-pressed="animationPaused"
        :title="$t('アニメーションを一時停止または再開')"
      >
        <span class="translate" v-if="needsTranslation(reply)" dir="auto">
          {{ getContent(reply) }}
        </span>
        <span v-else dir="auto">
          {{ reply.content }}
        </span>
      </button>

      <UiTooltip v-if="canShowEditButton" :text="$t('編集')">
        <UiButton
          appearance="text"
          tone="neutral"
          density="dense"
          iconOnly
          :aria-label="$t('編集')"
          :data-testid="'timeline-animation-reply-edit-button-' + reply._id"
          @click.stop="showEditReplyDialog(post, reply, $event)"
        >
          <UiIcon name="create" :size="20" />
        </UiButton>
      </UiTooltip>

      <UiTooltip v-if="canShowEditTagButton" :text="$t('タグ更新')">
        <UiButton
          appearance="text"
          tone="neutral"
          density="dense"
          iconOnly
          :aria-label="$t('タグ更新')"
          :data-testid="'timeline-animation-reply-tag-button-' + reply._id"
          @click.stop="showEditTagDialog({ post_id: postId, reply_id: reply._id }, reply.room_tags, $event)"
        >
          <UiIcon name="tag" :size="20" />
        </UiButton>
      </UiTooltip>

      <UiTooltip v-if="canShowDeleteButton" :text="$t('削除')">
        <UiButton
          appearance="text"
          tone="neutral"
          density="dense"
          iconOnly
          :aria-label="$t('削除')"
          @click.stop="onPressAnimationReply(postId, reply, $event)"
        >
          <UiIcon name="delete" :size="20" />
        </UiButton>
      </UiTooltip>

      <UiTooltip v-if="canShowKickButton" class="kick-button" :text="$t('ユーザをキックする')">
        <UiButton
          appearance="text"
          tone="danger"
          density="dense"
          iconOnly
          :aria-label="$t('ユーザをキックする')"
          @click.stop="onPressAnimationReplyKick(reply.user._id, resolveUserDisplayName(reply.user), $event)"
        >
          <UiIcon class="kick-icon" name="block" :size="20" />
        </UiButton>
      </UiTooltip>
    </div>
  </div>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import TranslationUtil from '@/utils/translationUtil';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: [
    'animationClicked',
    'showDeleteReplyDialog',
    'showEditKickedUserDialog',
    'showEditReplyDialog',
    'showEditTagDialog',
  ],
  name: 'AnimationReplyItem',
  components: {
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    postId: { type: String, required: true },
    post: { type: Object, required: true },
    reply: { type: Object, required: true },
    columnIndex: { type: Number, required: true },
    animatingItemsColumn: { type: Object, required: true },
    animationEnabled: { type: Boolean, required: true },
    needThreadLine: { type: Boolean, default: false },
  },
  data() {
    return {
      animationPaused: false,
    };
  },
  computed: {
    isRunning() {
      return this.animatingItemsColumn[this.reply._id] === true;
    },
    canEditReply() {
      return (
        (this.reply.user && this.reply.user._id === this.$store.getters.userId) ||
        this.$store.getters.userRole === 'Administrator' ||
        this.$store.getters.roomRole === 'FloorEditor' ||
        this.$store.getters.roomRole === 'FloorMember'
      );
    },
    canDeleteReply() {
      return (
        (this.reply.user && this.reply.user._id === this.$store.getters.userId) ||
        this.$store.getters.userRole === 'Administrator' ||
        this.$store.getters.roomRole === 'FloorEditor' ||
        this.$store.getters.roomRole === 'FloorMember'
      );
    },
    canShowDeleteButton() {
      return this.canDeleteReply && !this.animatingItemsColumn[this.reply._id];
    },
    canShowEditButton() {
      return this.canEditReply && !this.animatingItemsColumn[this.reply._id];
    },
    canShowEditTagButton() {
      return this.canEditTag(this.reply.user) && !this.animatingItemsColumn[this.reply._id];
    },
    canShowKickButton() {
      const { userRole, roomRole, displayUserKickButton } = this.$store.getters;
      const isAdminOrFloorEditor = userRole === 'Administrator' || roomRole === 'FloorEditor';
      const hasValidUser = this.reply.user !== undefined && this.reply.user !== null;
      const isNotAnimating = !this.animatingItemsColumn[this.reply._id];
      return displayUserKickButton && isAdminOrFloorEditor && hasValidUser && isNotAnimating;
    },
  },
  watch: {
    animationEnabled(enabled) {
      if (!enabled) this.animationPaused = false;
    },
  },
  methods: {
    ...userDisplayMethods,
    needsTranslation(data) {
      return TranslationUtil.needsTranslation(data, this.$i18n.locale);
    },
    getContent(data) {
      return TranslationUtil.getContent(data, this.$i18n.locale);
    },
    canEditTag(user) {
      if (this.$store.getters.userId === null) return false;
      if (user === null) return true;
      if (user && user._id !== this.$store.getters.userId) return true;
      return false;
    },
    onAnimationClicked(event) {
      this.requestAnimationToggle(event.currentTarget);
    },
    requestAnimationToggle(animationRoot) {
      if (
        !animationRoot ||
        !this.animationEnabled ||
        (!this.isRunning && !this.animationPaused) ||
        animationRoot.classList.contains('animation-complete')
      ) {
        return;
      }
      this.animationPaused = !this.animationPaused;
      this.$emit('animationClicked', animationRoot);
    },
    showEditReplyDialog(post, reply, event) {
      this.$emit('showEditReplyDialog', post, reply, event);
    },
    showEditTagDialog(id, tags, event) {
      this.$emit('showEditTagDialog', id, tags, event);
    },
    onPressAnimationReply(postId, reply, event) {
      this.$emit('showDeleteReplyDialog', postId, reply, event);
    },
    onPressAnimationReplyKick(userId, userName, event) {
      this.$emit('showEditKickedUserDialog', userId, userName, event);
    },
  },
};
</script>

<style scoped>
.thread-line {
  --pt: 16px; /* 行の上余白 */
  --av: 40px; /* アイコンの一辺 */
  --x: 27px; /* 縦線を描く横位置 */

  position: relative;
  /* 左余白は行の余白16pxとアイコン幅40pxの合計にする。 */
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

.animation {
  display: inline-flex;
  align-items: center;
  color: white;
}
.animation-content {
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
}
.animation-content:enabled {
  cursor: pointer;
}
.animation-content:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
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
  display: flex;
  height: 0;
  padding-block: 0;
  margin-block: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.translate {
  color: lightskyblue;
}

.kick-button {
  margin-inline-start: auto !important;
}
.kick-icon {
  color: #ff5252 !important;
}
</style>
