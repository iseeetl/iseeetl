<template>
  <UiDialog
    class="update-floor-display-confirm-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="update_floor_display_confirm_title"
    description-ids="update_floor_display_confirm_description"
    initial-focus=".update-floor-display-cancel"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedConfirm"
  >
    <template #title>
      <UiButton
        class="update-floor-display-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="update_floor_display_confirm_title" class="ui-dialog__heading">
        {{ floorDisplayHidden ? $t('全フロア非表示') : $t('全フロア表示') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        data-testid="update-floor-display-confirm"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="actionLabel"
        :disabled="sending"
        @click.stop="onPressDoneButton"
      >
        <UiIcon :name="actionIcon" />
      </UiButton>
    </template>

    <p id="update_floor_display_confirm_description">
      {{ floorDisplayHidden ? $t('作成したフロアの全てを非表示にします') : $t('作成したフロアの全てを表示します') }}
    </p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="update-floor-display-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          data-testid="update-floor-display-confirm"
          appearance="filled"
          tone="primary"
          :disabled="sending"
          @click.stop="onPressDoneButton"
        >
          <UiIcon :name="actionIcon" :size="18" />
          {{ actionLabel }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="indeterminate"
        aria-labelledby="update_floor_display_confirm_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['close', 'done'],
  name: 'UpdateFloorDisplayConfirm',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    confirmVisible: Boolean,
    floorDisplayHidden: Boolean,
    sending: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      visible: this.confirmVisible,
    };
  },
  watch: {
    confirmVisible() {
      this.visible = this.confirmVisible;
    },
  },
  computed: {
    actionLabel() {
      return this.floorDisplayHidden ? this.$t('非表示にする') : this.$t('表示する');
    },
    actionIcon() {
      return this.floorDisplayHidden ? 'visibility_off' : 'visibility';
    },
  },
  methods: {
    onPressDoneButton() {
      if (this.sending) return;
      this.$emit('done', this.floorDisplayHidden);
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    closedConfirm() {
      if (this.sending) return;
      this.$emit('close');
    },
  },
};
</script>

<style scoped>
.common-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 12px;
}

.common-dialog-actions .ui-icon {
  margin-inline-end: 6px;
}

@media screen and (max-width: 896px) {
  :global(.update-floor-display-confirm-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
