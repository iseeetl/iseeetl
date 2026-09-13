<template>
  <UiDialog
    :class="{ 'management-lifecycle-dialog--actions-adjacent': actionsAdjacent }"
    :open="open"
    :title-id="titleId"
    :description-ids="descriptionIds"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    :aria-busy="sending ? 'true' : 'false'"
    data-testid="management-lifecycle-dialog"
    @request-close="onRequestClose"
    @closed="$emit('closed', $event)"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('managementUi.cancel')"
        :disabled="sending"
        data-testid="management-lifecycle-cancel"
        @click.stop="onCancel"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 :id="titleId" class="ui-dialog__heading">{{ title }}</h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        :tone="confirmTone"
        icon-only
        :aria-label="confirmLabel"
        :disabled="sending"
        data-testid="management-lifecycle-confirm"
        @click.stop="onConfirm"
      >
        <UiIcon :name="confirmIcon" />
      </UiButton>
    </template>

    <p :id="messageId" class="management-lifecycle-dialog__message">{{ message }}</p>
    <p
      v-if="showRecoveryNote"
      :id="recoverableId"
      class="management-lifecycle-dialog__recoverable"
    >
      {{ $t('managementUi.deletedCanRestore') }}
    </p>
    <div v-if="$slots.default" :id="detailsId" class="management-lifecycle-dialog__details">
      <slot />
    </div>
    <p v-if="warning" :id="warningId" class="management-lifecycle-dialog__warning">
      {{ warning }}
    </p>
    <div v-else-if="$slots.warning" :id="warningId" class="management-lifecycle-dialog__warning">
      <slot name="warning" />
    </div>

    <template #actions>
      <div
        :class="[
          'management-lifecycle-dialog__actions',
          { 'management-lifecycle-dialog__actions--adjacent': actionsAdjacent },
        ]"
      >
        <UiButton
          class="desktop-item management-lifecycle-dialog__cancel"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          data-testid="management-lifecycle-cancel"
          @click.stop="onCancel"
        >
          {{ $t('managementUi.cancel') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          :tone="confirmTone"
          :disabled="sending"
          data-testid="management-lifecycle-confirm"
          @click.stop="onConfirm"
        >
          {{ confirmLabel }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress v-show="sending" mode="indeterminate" :aria-labelledby="titleId" />
    </template>
  </UiDialog>
</template>

<script>
import { useId } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

const ACTIONS = ['delete', 'restore'];

export default {
  name: 'ManagementLifecycleDialog',
  components: {
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  emits: ['confirm', 'cancel', 'closed', 'request-close'],
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    sending: {
      type: Boolean,
      default: false,
    },
    action: {
      type: String,
      required: true,
      validator: (value) => ACTIONS.includes(value),
    },
    resourceLabel: {
      type: String,
      required: true,
    },
    resourceName: {
      type: String,
      required: true,
    },
    warning: {
      type: String,
      default: '',
    },
    showDeleteRecoveryNote: {
      type: Boolean,
      default: true,
    },
    actionsAdjacent: {
      type: Boolean,
      default: true,
    },
  },
  setup() {
    const instancePrefix = `management-lifecycle-${useId()}`;

    return {
      titleId: `${instancePrefix}-title`,
      messageId: `${instancePrefix}-message`,
      recoverableId: `${instancePrefix}-recoverable`,
      detailsId: `${instancePrefix}-details`,
      warningId: `${instancePrefix}-warning`,
    };
  },
  computed: {
    isDelete() {
      return this.action === 'delete';
    },
    title() {
      return this.$t(this.isDelete ? 'managementUi.deleteConfirmTitle' : 'managementUi.restoreConfirmTitle');
    },
    message() {
      return this.$t(
        this.isDelete ? 'managementUi.deleteConfirmMessage' : 'managementUi.restoreConfirmMessage',
        { resource: this.resourceLabel, name: this.resourceName }
      );
    },
    confirmLabel() {
      return this.$t(this.isDelete ? 'managementUi.delete' : 'managementUi.restore');
    },
    confirmTone() {
      return this.isDelete ? 'danger' : 'primary';
    },
    confirmIcon() {
      return this.isDelete ? 'delete' : 'restore';
    },
    showRecoveryNote() {
      return this.isDelete && this.showDeleteRecoveryNote;
    },
    hasWarning() {
      return Boolean(this.warning || this.$slots.warning);
    },
    hasDetails() {
      return Boolean(this.$slots.default);
    },
    descriptionIds() {
      const ids = [this.messageId];
      if (this.showRecoveryNote) ids.push(this.recoverableId);
      if (this.hasDetails) ids.push(this.detailsId);
      if (this.hasWarning) ids.push(this.warningId);
      return ids.join(' ');
    },
  },
  methods: {
    onConfirm() {
      if (this.sending) return;
      this.$emit('confirm', this.action);
    },
    onCancel() {
      if (this.sending) return;
      this.$emit('cancel');
    },
    onRequestClose(payload) {
      if (this.sending) return;
      this.$emit('request-close', payload);
    },
  },
};
</script>

<style scoped>
.management-lifecycle-dialog__message,
.management-lifecycle-dialog__recoverable,
.management-lifecycle-dialog__details,
.management-lifecycle-dialog__warning {
  overflow-wrap: anywhere;
}

.management-lifecycle-dialog__warning {
  color: var(--ui-color-danger);
  font-weight: 600;
}

.management-lifecycle-dialog__actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.management-lifecycle-dialog__cancel {
  margin-inline-end: auto;
}

@media screen and (min-width: 897px) {
  .management-lifecycle-dialog__actions--adjacent {
    gap: 12px;
  }

  .management-lifecycle-dialog__actions--adjacent .management-lifecycle-dialog__cancel {
    margin-inline-end: 0;
  }
}

@media screen and (max-width: 896px) {
  :global(.management-lifecycle-dialog--actions-adjacent .ui-dialog__actions) {
    display: none;
  }
}
</style>
