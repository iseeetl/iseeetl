<template>
  <UiDialog
    class="help-dialog"
    :open="visible"
    title-id="help_dialog_title"
    description-ids="help_dialog_description"
    initial-focus=".help-dialog__primary-close-button"
    data-testid="dialog-help"
    @request-close="onPressCloseButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('閉じる')"
        data-testid="dialog-help-close-mobile"
        @click.stop="onPressCloseButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="help_dialog_title" class="ui-dialog__heading dialog-title">
        {{ $t('ヘルプ及びショートカット一覧') }}
      </h2>
    </template>

    <div id="help_dialog_description" class="help-dialog-content">
      <HelpContent />
    </div>

    <template #actions>
      <div class="help-dialog__actions">
        <UiButton
          class="help-dialog__primary-close-button desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-help-close-desktop"
          @click.stop="onPressCloseButton"
        >
          {{ $t('閉じる') }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script>
import HelpContent from '@/components/help/HelpContent.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  emits: ['close'],
  name: 'HelpDialog',
  components: {
    HelpContent,
    UiButton,
    UiDialog,
    UiIcon,
  },
  props: {
    dialogVisible: Boolean,
  },
  data() {
    return {
      visible: this.dialogVisible,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    onPressCloseButton() {
      this.visible = false;
    },
    closedDialog(payload) {
      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
.help-dialog-content {
  max-height: 70vh;
  overflow-y: auto;
}

.help-dialog__actions {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.help-dialog :deep(.ui-dialog__panel){
  width: calc(100vw - 48px);
  max-width: 920px;
}

@media screen and (max-width: 896px) {
  .help-dialog :deep(.ui-dialog__actions) {
    display: none;
  }

  .help-dialog :deep(.ui-dialog__panel){
    width: calc(100vw - 24px);
  }

  .help-dialog-content {
    max-height: 72vh;
  }
}
</style>
