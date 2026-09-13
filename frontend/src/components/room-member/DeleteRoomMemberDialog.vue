<template>
  <UiDialog
    class="delete-room-member-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="delete_room_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus=".delete-room-member-cancel"
    data-testid="dialog-delete-room-member"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="delete-room-member-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-delete-room-member-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="delete_room_member_dialog_title" class="ui-dialog__heading">
        {{ $t('roomMemberDialogs.deleteTitle') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('削除')"
        :disabled="sending"
        data-testid="dialog-delete-room-member-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="delete" />
      </UiButton>
    </template>

    <div class="delete-room-member-contexts">
      <DialogTargetContext
        v-if="roomTitle"
        :context-id="roomContextId"
        :label="$t('対象ルーム')"
        :name="roomTitle"
      />
      <DialogTargetContext
        v-if="userName"
        :context-id="memberContextId"
        :label="$t('roomMemberDialogs.targetMember')"
        :name="userName"
      />
    </div>
    <p id="delete_room_member_dialog_description">{{ $t('ルームメンバーから削除する') }}</p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="delete-room-member-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-delete-room-member-cancel-desktop"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          data-testid="dialog-delete-room-member-confirm-desktop"
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
        aria-labelledby="delete_room_member_dialog_title"
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
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'success'],
  name: 'DeleteRoomMemberDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    propsRoomMember: {
      type: Object,
      default: null,
    },
    roomTitle: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
    };
  },
  computed: {
    memberId() {
      return this.propsRoomMember?._id || null;
    },
    userName() {
      return this.resolveUserDisplayName(this.propsRoomMember?.user) || '';
    },
    roomContextId() {
      return 'delete_room_member_dialog_room_context';
    },
    memberContextId() {
      return 'delete_room_member_dialog_member_context';
    },
    descriptionIds() {
      return [
        this.roomTitle ? this.roomContextId : '',
        this.userName ? this.memberContextId : '',
        'delete_room_member_dialog_description',
      ]
        .filter(Boolean)
        .join(' ');
    },
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    ...userDisplayMethods,
    deleteRoomMember() {
      if (!this.memberId) return;
      this.sending = true;

      const data = {
        _id: this.memberId,
      };
      roomMemberApi
        .remove(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          this.setSnackbar(`${this.$t('roomMemberDialogs.deleteTitle')}: ${this.$t('完了')}`, 'status');
          this.$emit('success', res.data);
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('ルームメンバーの削除に失敗しました'), err, {
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
      this.deleteRoomMember();
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

.delete-room-member-contexts {
  display: grid;
  gap: 8px;
}

@media screen and (max-width: 896px) {
  :global(.delete-room-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
