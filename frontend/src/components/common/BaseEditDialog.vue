<template>
  <UiDialog
    class="ui-dialog--standard"
    :class="{ 'base-edit-dialog--actions-adjacent': actionsAdjacent }"
    :open="localVisible"
    :title-id="titleId"
    :description-ids="descriptionIds"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    :initial-focus="initialFocus"
    :aria-busy="sending ? 'true' : 'false'"
    @request-close="onCancel"
    @opened="$emit('opened')"
    @closed="$emit('closed', $event)"
  >
    <template #title>
      <UiButton
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
      <h2 :id="titleId" class="ui-dialog__heading">
        {{ titleText }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        :data-testid="mobileConfirmTestId || confirmTestId"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="confirmLabel"
        :disabled="sending || confirmDisabled"
        @click.stop="onConfirm"
      >
        <UiIcon name="done" />
      </UiButton>
    </template>

    <slot />

    <template #actions>
      <div
        class="common-dialog-actions"
        :class="{ 'common-dialog-actions--adjacent': actionsAdjacent }"
      >
        <div class="common-dialog-actions__start">
          <UiButton
            class="desktop-item"
            :data-testid="cancelTestId"
            appearance="filled"
            tone="neutral"
            :aria-label="cancelLabel"
            :disabled="sending"
            @click.stop="onCancel"
          >
            {{ cancelLabel }}
          </UiButton>
        </div>
        <div>
          <UiButton
            class="desktop-item"
            :data-testid="confirmTestId"
            appearance="filled"
            tone="primary"
            :disabled="sending || confirmDisabled"
            @click.stop="onConfirm"
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
        :aria-labelledby="titleId"
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
  emits: [
    'cancel',
    'closed',
    'confirm',
    'opened',
    'update:visible',
  ],
  name: 'BaseEditDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
    sending: {
      type: Boolean,
      default: false,
    },
    titleId: {
      type: String,
      required: true,
    },
    titleText: {
      type: String,
      required: true,
    },
    descriptionIds: {
      type: String,
      default: '',
    },
    cancelLabel: {
      type: String,
      required: true,
    },
    confirmLabel: {
      type: String,
      required: true,
    },
    progressAmount: {
      type: Number,
      default: 0,
    },
    progressMode: {
      type: String,
      default: 'determinate',
      validator: (value) => ['determinate', 'indeterminate'].includes(value),
    },
    actionsAdjacent: {
      type: Boolean,
      default: false,
    },
    confirmDisabled: {
      type: Boolean,
      default: false,
    },
    cancelTestId: {
      type: String,
      default: 'base-edit-dialog-cancel',
    },
    mobileCancelTestId: {
      type: String,
      default: '',
    },
    confirmTestId: {
      type: String,
      default: 'base-edit-dialog-confirm',
    },
    mobileConfirmTestId: {
      type: String,
      default: '',
    },
    initialFocus: {
      type: String,
      default: undefined,
    },
  },
  data() {
    return {
      localVisible: this.visible,
    };
  },
  watch: {
    visible(nextValue) {
      this.localVisible = nextValue;
    },
    localVisible(nextValue) {
      this.$emit('update:visible', nextValue);
    },
  },
  methods: {
    onCancel() {
      if (this.sending) return;
      this.$emit('cancel');
    },
    onConfirm() {
      if (this.sending || this.confirmDisabled) return;
      this.$emit('confirm');
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
  :global(.base-edit-dialog--actions-adjacent .ui-dialog__actions) {
    display: none;
  }
}
</style>
