<template>
  <div class="smartphone-send-button">
    <UiButton
      class="button-position-right"
      appearance="filled"
      tone="primary"
      @click="emitShowEditPostDialog(true)"
    >
      <div class="timeline-menu-icon-wrapper">
        <UiIcon class="timeline-menu-icon" name="arrow_back" />
        {{ $t('流す') }}
      </div>
    </UiButton>
    <UiButton
      v-if="!isGuestReactionOnly"
      appearance="filled"
      tone="primary"
      @click="emitShowEditPostDialog(false)"
    >
      <div class="timeline-menu-icon-wrapper">
        <UiIcon class="timeline-menu-icon" name="add_comment" />
        {{ $t('投稿') }}
      </div>
    </UiButton>
  </div>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  name: 'TimelineMobilePostButtons',
  components: {
    UiButton,
    UiIcon,
  },
  props: {
    isGuestReactionOnly: {
      type: Boolean,
      default: false,
    },
    defaultTagIds: {
      type: Array,
      default: () => [],
    },
    onShowEditPostDialog: {
      type: Function,
      required: true,
    },
  },
  methods: {
    emitShowEditPostDialog(isAnimationPost) {
      this.onShowEditPostDialog(null, isAnimationPost, this.defaultTagIds);
    },
  },
};
</script>

<style scoped>
.smartphone-send-button {
  display: flex;
  position: absolute;
  bottom: 16px;
  inset-inline-end: 16px;
  z-index: 99;
  justify-content: flex-end;
}
.smartphone-send-button > button {
  margin: 8px !important;
}

.timeline-menu-icon-wrapper {
  display: flex;
  align-items: center;
}

.timeline-menu-icon {
  padding-inline-end: 6px;
}

@media (min-width: 897px) {
  .smartphone-send-button {
    display: none;
  }
}
@media (max-width: 896px) {
  .smartphone-send-button {
    display: flex;
  }
}
</style>
