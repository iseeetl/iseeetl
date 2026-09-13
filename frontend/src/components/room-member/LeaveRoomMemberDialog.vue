<template>
  <UiDialog
    class="leave-room-member-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="leave_room_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus=".leave-room-member-cancel"
    data-testid="dialog-leave-room-member"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="leave-room-member-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-leave-room-member-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="leave_room_member_dialog_title" class="ui-dialog__heading">
        {{ $t('ルームメンバー脱退') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('脱退')"
        :disabled="sending"
        data-testid="dialog-leave-room-member-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="logout" />
      </UiButton>
    </template>

    <DialogTargetContext
      v-if="resolvedRoomTitle"
      :context-id="roomContextId"
      :label="$t('対象ルーム')"
      :name="resolvedRoomTitle"
    />
    <p id="leave_room_member_dialog_description">{{ $t('ルームメンバー脱退') }}</p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="leave-room-member-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-leave-room-member-cancel-desktop"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          data-testid="dialog-leave-room-member-confirm-desktop"
          :disabled="sending"
          @click.stop="onPressDoneButton"
        >
          {{ $t('脱退') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        aria-labelledby="leave_room_member_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import roomMemberApi from '@/api/roomMember';
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
  name: 'LeaveRoomMemberDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    roomId: {
      type: String,
      default: '',
    },
    roomTitle: {
      type: String,
      default: '',
    },
  },
  computed: {
    resolvedRoomId() {
      return this.roomId || this.$store?.getters?.roomId || '';
    },
    resolvedRoomTitle() {
      return this.roomTitle || this.$store?.getters?.roomTitle || '';
    },
    roomContextId() {
      return 'leave_room_member_dialog_context';
    },
    descriptionIds() {
      return [
        this.resolvedRoomTitle ? this.roomContextId : '',
        'leave_room_member_dialog_description',
      ]
        .filter(Boolean)
        .join(' ');
    },
  },
  data() {
    return {
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
    leaveRoomMember() {
      if (!this.resolvedRoomId) return;
      this.sending = true;

      const data = {
        room_id: this.resolvedRoomId,
      };
      roomMemberApi
        .leave(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          this.setSnackbar(`${this.$t('ルームメンバー脱退')}: ${this.$t('完了')}`, 'status');
          this.$emit('success', res.data);
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('ルームメンバーの脱退に失敗しました'), err, {
            translate: this.$t,
          });
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
      this.leaveRoomMember();
    },

    closedDialog() {
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

@media screen and (max-width: 896px) {
  :global(.leave-room-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
