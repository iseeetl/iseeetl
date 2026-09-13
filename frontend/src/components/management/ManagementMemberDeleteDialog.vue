<template>
  <UiDialog
    class="management-member-delete-dialog"
    :open="open"
    :title-id="titleId"
    :description-ids="descriptionIds"
    initial-focus=".management-dialog-cancel-button"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="requestClose"
  >
    <template #title>
      <UiButton
        class="management-dialog-cancel-button ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        :data-testid="`${testIdPrefix}-cancel-mobile`"
        @click.stop="cancel"
      >
        <UiIcon name="close" />
      </UiButton>

      <h2 :id="titleId" class="ui-dialog__heading">{{ title }}</h2>

      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('削除')"
        :disabled="sending"
        :data-testid="`${testIdPrefix}-confirm-mobile`"
        @click.stop="confirm"
      >
        <UiIcon name="delete" />
      </UiButton>
    </template>

    <div class="management-member-delete-dialog__contexts">
      <DialogTargetContext
        v-if="resourceName"
        :context-id="resourceContextId"
        :label="resourceLabel"
        :name="resourceName"
      />
      <DialogTargetContext
        v-if="userName"
        :context-id="userContextId"
        :label="$t('対象ユーザ')"
        :name="userName"
      />
    </div>

    <p :id="messageId" class="management-member-delete-dialog__message">{{ message }}</p>

    <template #actions>
      <div class="management-member-delete-dialog__actions">
        <UiButton
          class="management-dialog-cancel-button desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          :data-testid="`${testIdPrefix}-cancel-desktop`"
          @click.stop="cancel"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          :disabled="sending"
          :data-testid="`${testIdPrefix}-confirm`"
          @click.stop="confirm"
        >
          {{ $t('削除') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress v-show="sending" mode="indeterminate" :aria-labelledby="titleId" />
    </template>
  </UiDialog>
</template>

<script>
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  name: 'ManagementMemberDeleteDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  emits: ['cancel', 'confirm', 'request-close'],
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    sending: {
      type: Boolean,
      default: false,
    },
    titleId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    resourceLabel: {
      type: String,
      required: true,
    },
    resourceName: {
      type: String,
      default: '',
    },
    userName: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: true,
    },
    testIdPrefix: {
      type: String,
      default: 'management-member-delete',
    },
  },
  computed: {
    resourceContextId() {
      return `${this.titleId}-resource-context`;
    },
    userContextId() {
      return `${this.titleId}-user-context`;
    },
    messageId() {
      return `${this.titleId}-description`;
    },
    descriptionIds() {
      return [
        this.resourceName ? this.resourceContextId : '',
        this.userName ? this.userContextId : '',
        this.messageId,
      ]
        .filter(Boolean)
        .join(' ');
    },
  },
  methods: {
    cancel() {
      if (this.sending) return;
      this.$emit('cancel');
    },
    confirm() {
      if (this.sending) return;
      this.$emit('confirm');
    },
    requestClose(payload) {
      if (this.sending) return;
      this.$emit('request-close', payload);
    },
  },
};
</script>

<style scoped>
.management-member-delete-dialog__contexts {
  display: grid;
  gap: 8px;
}

.management-member-delete-dialog__message {
  margin-block: 16px 0;
}

.management-member-delete-dialog__actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 12px;
}

@media screen and (max-width: 896px) {
  :global(.management-member-delete-dialog) {
    --ui-dialog-width: 520px;
  }
}

@media screen and (max-width: 896px) {
  :global(.management-member-delete-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
