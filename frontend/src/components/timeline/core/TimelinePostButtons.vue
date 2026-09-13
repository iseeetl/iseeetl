<template>
  <div class="timeline-post-buttons">
    <UiTooltip :text="$t('流す')">
      <UiButton
        appearance="filled"
        tone="primary"
        iconOnly
        :aria-label="`${$t('流す')} ${$t('ショートカットキー M')}`"
        data-testid="timeline-nagasu-button"
        @click="emitNagasu"
      >
        <UiIcon name="arrow_back" />
      </UiButton>
    </UiTooltip>

    <UiTooltip v-if="!isGuestReactionOnly" :text="$t('投稿')">
      <UiButton
        appearance="filled"
        tone="primary"
        iconOnly
        :aria-label="`${$t('投稿')} ${$t('ショートカットキー N')}`"
        data-testid="timeline-post-button"
        @click="emitPost"
      >
        <UiIcon name="add_comment" />
      </UiButton>
    </UiTooltip>
  </div>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  emits: ['showEditPostDialog'],
  name: 'TimelinePostButtons',
  components: {
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    isGuestReactionOnly: { type: Boolean, default: false },
    defaultTagIds: { type: Array, default: () => [] },
  },
  methods: {
    emitNagasu() {
      this.$emit('showEditPostDialog', null, true, this.defaultTagIds);
    },
    emitPost() {
      this.$emit('showEditPostDialog', null, false, this.defaultTagIds);
    },
  },
};
</script>

<style scoped>
.timeline-post-buttons {
  display: flex;
  margin-inline-end: 32px;
}

@media screen and (max-width: 896px) {
  .timeline-post-buttons {
    display: none;
  }
}
</style>
