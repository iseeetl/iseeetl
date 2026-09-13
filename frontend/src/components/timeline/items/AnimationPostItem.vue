<template>
  <div class="wrapper">
    <div
      class="animation"
      :data-post-id="post._id"
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
        <span class="translate" v-if="needsTranslation(post)" dir="auto">
          {{ getContent(post) }}
        </span>
        <span v-else dir="auto">
          {{ post.content }}
        </span>
      </button>

      <UiTooltip v-if="canShowEditButton" :text="$t('編集')">
        <UiButton
          appearance="text"
          tone="neutral"
          density="dense"
          iconOnly
          :aria-label="$t('編集')"
          :data-testid="'timeline-animation-post-edit-button-' + post._id"
          @click.stop="showEditPostDialog(post)"
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
          :data-testid="'timeline-animation-post-tag-button-' + post._id"
          @click.stop="showEditTagDialog({ post_id: post._id, reply_id: null }, post.room_tags, $event)"
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
          @click.stop="onPressAnimationPost(post, $event)"
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
          @click.stop="showEditKickedUserDialog(post.user._id, resolveUserDisplayName(post.user), $event)"
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
    'showDeletePostDialog',
    'showEditKickedUserDialog',
    'showEditPostDialog',
    'showEditTagDialog',
  ],
  name: 'AnimationPostItem',
  components: {
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    post: { type: Object, required: true },
    columnIndex: { type: Number, required: true },
    animatingItemsColumn: { type: Object, required: true },
    animationEnabled: { type: Boolean, required: true },
  },
  data() {
    return {
      animationPaused: false,
    };
  },
  computed: {
    isRunning() {
      return this.animatingItemsColumn[this.post._id] === true;
    },
    canEditPost() {
      return (
        (this.post.user && this.post.user._id === this.$store.getters.userId) ||
        this.$store.getters.userRole === 'Administrator' ||
        this.$store.getters.roomRole === 'FloorEditor' ||
        this.$store.getters.roomRole === 'FloorMember'
      );
    },
    canDeletePost() {
      return (
        (this.post.user && this.post.user._id === this.$store.getters.userId) ||
        this.$store.getters.userRole === 'Administrator' ||
        this.$store.getters.roomRole === 'FloorEditor' ||
        this.$store.getters.roomRole === 'FloorMember'
      );
    },
    canShowDeleteButton() {
      return this.canDeletePost && !this.animatingItemsColumn[this.post._id];
    },
    canShowEditButton() {
      return this.canEditPost && !this.animatingItemsColumn[this.post._id];
    },
    canShowEditTagButton() {
      return this.canEditTag(this.post.user) && !this.animatingItemsColumn[this.post._id];
    },

    canShowKickButton() {
      const { userRole, roomRole, displayUserKickButton } = this.$store.getters;
      const isAdminOrFloorEditor = userRole === 'Administrator' || roomRole === 'FloorEditor';
      const hasValidUser = this.post.user !== undefined && this.post.user !== null;
      const isNotAnimating = !this.animatingItemsColumn[this.post._id];
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

    onAnimationClicked(evt) {
      this.requestAnimationToggle(evt.currentTarget);
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

    showEditPostDialog(post) {
      this.$emit('showEditPostDialog', post, true);
    },

    showEditTagDialog(id, tags, event) {
      this.$emit('showEditTagDialog', id, tags, event);
    },

    onPressAnimationPost(post, event) {
      this.$emit('showDeletePostDialog', post, event);
    },

    showEditKickedUserDialog(id, name, event) {
      this.$emit('showEditKickedUserDialog', id, name, event);
    },
  },
};
</script>

<style scoped>
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
