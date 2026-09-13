<template>
  <UiDialog
    class="floor-delete-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="delete_floor_dialog_title"
    description-ids="delete_floor_dialog_context delete_floor_dialog_description"
    initial-focus="[data-testid='delete-floor-dialog-cancel']"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        data-testid="delete-floor-dialog-cancel"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="delete_floor_dialog_title" class="ui-dialog__heading">
        {{ $t('フロアを削除') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        data-testid="delete-floor-dialog-confirm"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('削除')"
        :disabled="sending"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="delete" />
      </UiButton>
    </template>

    <DialogTargetContext
      context-id="delete_floor_dialog_context"
      :label="$t('対象フロア')"
      :name="targetName || title || ''"
    />

    <div id="delete_floor_dialog_description" class="floor-delete-description">
      <p>{{ $t('このフロアを削除しますか？') }}</p>
      <p>
        {{ $t('削除すると一覧から外れ、通常操作ではこのフロアと配下のルーム・タイムラインを利用できなくなります。') }}
      </p>
    </div>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          data-testid="delete-floor-dialog-cancel"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          data-testid="delete-floor-dialog-confirm"
          appearance="filled"
          tone="danger"
          :disabled="sending"
          @click.stop="onPressDoneButton"
        >
          {{ $t('削除') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        aria-labelledby="delete_floor_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import floorApi from '@/api/floor';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['close', 'success'],
  name: 'DeleteFloorDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    propsFloor: Object,
    targetName: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      id: null,
      title: null,
      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    openedDialog() {
      this.id = this.propsFloor._id;
      this.title = this.propsFloor.title;
    },

    deleteFloor() {
      this.sending = true;

      const data = {
        _id: this.id,
      };
      floorApi
        .remove(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          this.$emit('success', res.data);
          this.setSnackbar(this.$t('フロアを削除しました'), 'status');
          this.visible = false;
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('フロアの削除に失敗しました'), err, { translate: this.$t });
          this.setSnackbar(message, 'alert');

          if (this.handleAuthError(err)) return;
        })
        .finally(() => {
          this.sending = false;
          this.progressAmount = 0;
        });
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    onPressDoneButton() {
      if (this.sending) return;
      this.deleteFloor();
    },

    clearValue() {
      this.id = null;
      this.title = null;
    },

    closedDialog() {
      this.clearValue();
      if (!this.sending) {
        this.$emit('close');
      }
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },

    handleAuthError(err) {
      return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
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

.floor-delete-description p:last-child {
  margin-bottom: 0;
}

@media screen and (max-width: 896px) {
  :global(.floor-delete-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
