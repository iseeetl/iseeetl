<template>
  <UiDialog
    :class="{ 'confirm-dialog--actions-adjacent': actionsAdjacent }"
    :open="visible"
    :title-id="resolvedTitleId"
    :description-ids="dialogDescriptionId"
    data-testid="confirm-dialog"
    :close-on-escape="!sending && closeOnEscape"
    :close-on-backdrop="!sending && closeOnBackdrop"
    :initial-focus="initialFocus"
    :aria-busy="sending ? 'true' : 'false'"
    ref="dialogRootRef"
    @request-close="onRequestClose"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        v-if="cancelLabel"
        class="ui-dialog__header-start mobile-item"
        :data-testid="mobileCancelTestId || cancelTestId"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="cancelLabel"
        :disabled="sending"
        @click.stop="onCancel"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 :id="resolvedTitleId" class="ui-dialog__heading dialog-title">{{ title }}</h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        :data-testid="mobileConfirmTestId || confirmTestId"
        appearance="filled"
        :tone="confirmTone"
        icon-only
        :aria-label="confirmLabel"
        :disabled="sending"
        @click.stop="onConfirm"
      >
        <UiIcon :name="confirmIcon" />
      </UiButton>
    </template>

    <div :id="dialogDescriptionId">
      <slot>
        <p>{{ message }}</p>
      </slot>
    </div>

    <template #actions>
      <div
        :class="[
          'common-dialog-actions',
          { 'common-dialog-actions--adjacent': actionsAdjacent },
        ]"
      >
        <div class="common-dialog-actions__start">
          <UiButton
            v-if="cancelLabel"
            class="desktop-item"
            :data-testid="cancelTestId"
            appearance="filled"
            tone="neutral"
            @click.stop="onCancel"
            :disabled="sending"
          >
            {{ cancelLabel }}
          </UiButton>
        </div>
        <div>
          <UiButton
            class="desktop-item"
            :data-testid="confirmTestId"
            appearance="filled"
            :tone="confirmTone"
            @click.stop="onConfirm"
            :disabled="sending"
          >
            {{ confirmLabel }}
          </UiButton>
        </div>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        :mode="progressMode"
        :value="progressMode === 'determinate' ? progressAmount : undefined"
        :aria-labelledby="resolvedTitleId"
      />
    </template>
  </UiDialog>
</template>

<script>
import { useId } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['cancel', 'close', 'closed', 'confirm'],
  name: 'ConfirmDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: { type: Boolean, required: true },
    title: { type: String, default: 'Confirm' },
    titleId: { type: String, default: '' },
    message: { type: String, default: '' },
    confirmLabel: { type: String, default: 'OK' },
    cancelLabel: { type: String, default: null },
    sending: { type: Boolean, default: false },
    actionsAdjacent: { type: Boolean, default: false },
    closeOnConfirm: { type: Boolean, default: true },
    closeOnEscape: { type: Boolean, default: false },
    closeOnBackdrop: { type: Boolean, default: false },
    initialFocus: { type: String, default: undefined },
    cancelTestId: { type: String, default: 'confirm-dialog-cancel' },
    mobileCancelTestId: { type: String, default: '' },
    confirmTestId: { type: String, default: 'confirm-dialog-confirm' },
    mobileConfirmTestId: { type: String, default: '' },
    confirmIcon: { type: String, default: 'done' },
    confirmTone: { type: String, default: 'danger' },
    progressMode: {
      type: String,
      default: 'indeterminate',
      validator: (value) => ['determinate', 'indeterminate'].includes(value),
    },
    progressAmount: { type: Number, default: 0 },
  },
  setup() {
    const instancePrefix = `confirm-dialog-${useId()}`;

    return {
      dialogTitleId: `${instancePrefix}-title`,
      dialogDescriptionId: `${instancePrefix}-description`,
    };
  },
  data() {
    return {
      visible: this.dialogVisible,
    };
  },
  computed: {
    resolvedTitleId() {
      return this.titleId || this.dialogTitleId;
    },
  },
  watch: {
    dialogVisible(val) {
      this.visible = val;
    },
    visible(val) {
      if (!val) this.$emit('close');
    },
  },
  methods: {
    closedDialog(payload) {
      if (this.visible) this.visible = false;
      this.$emit('closed', payload);
    },
    onConfirm() {
      if (this.sending) return;
      this.$emit('confirm');
      if (this.closeOnConfirm) this.visible = false;
    },
    onCancel() {
      if (this.sending) return;
      this.$emit('cancel');
      this.visible = false;
    },
    onRequestClose() {
      if (this.sending) return;
      this.onCancel();
    },
  },
};
</script>

<style scoped>
.common-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.common-dialog-actions__start {
  margin-inline-end: auto;
}

@media screen and (min-width: 897px) {
  .common-dialog-actions--adjacent {
    gap: 12px;
  }

  .common-dialog-actions--adjacent .common-dialog-actions__start {
    margin-inline-end: 0;
  }
}

@media screen and (max-width: 896px) {
  :global(.confirm-dialog--actions-adjacent .ui-dialog__actions) {
    display: none;
  }
}
</style>
