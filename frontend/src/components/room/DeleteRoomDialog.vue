<template>
  <UiDialog
    class="room-delete-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="delete_room_dialog_title"
    description-ids="delete_room_dialog_context delete_room_dialog_description"
    initial-focus="[data-testid='delete-room-dialog-cancel']"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        data-testid="delete-room-dialog-cancel"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="delete_room_dialog_title" class="ui-dialog__heading">
        {{ $t('ルームを削除') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        data-testid="delete-room-dialog-confirm"
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
      context-id="delete_room_dialog_context"
      :label="$t('対象ルーム')"
      :name="targetName || title || ''"
    />

    <div id="delete_room_dialog_description" class="room-delete-description">
      <p>{{ $t('このルームを削除しますか？') }}</p>
      <p>
        {{ $t('削除すると一覧から外れ、通常操作ではこのルームとタイムラインを利用できなくなります。') }}
      </p>
    </div>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          data-testid="delete-room-dialog-cancel"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          data-testid="delete-room-dialog-confirm"
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
        aria-labelledby="delete_room_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import roomApi from '@/api/room';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiButton from '@/components/ui/UiButton.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['close', 'success'],
  name: 'DeleteRoomDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    room: Object,
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
      this.id = this.room._id;
      this.title = this.room.title;
      this.floor_id = this.$store.getters.floorId;
      this.floor_title = this.$store.getters.floorTitle;
    },

    deleteRoom() {
      this.sending = true;

      const data = {
        _id: this.id,
      };
      roomApi
        .remove(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          this.$emit('success', res.data);
          this.setSnackbar(this.$t('ルームを削除しました'), 'status');
          this.visible = false;
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('ルームの削除に失敗しました'), err, { translate: this.$t });
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
      this.deleteRoom();
    },

    clearValue() {
      this.id = null;
      this.title = null;
      this.floor_id = null;
      this.floor_title = null;
    },

    closedDialog() {
      if (this.sending) return;

      this.clearValue();
      this.$emit('close');
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

.room-delete-description p:last-child {
  margin-bottom: 0;
}

@media screen and (max-width: 896px) {
  :global(.room-delete-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
