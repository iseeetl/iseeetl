<template>
  <UiDialog
    class="edit-kicked-user-dialog ui-dialog--standard"
    ref="dialogRootRef"
    :open="visible"
    title-id="edit-kicked-user-dialog-title"
    :description-ids="descriptionIds"
    initial-focus=".edit-kicked-user-cancel"
    data-testid="dialog-edit-kicked-user"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="edit-kicked-user-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-edit-kicked-user-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="edit-kicked-user-dialog-title" class="ui-dialog__heading">
        {{ $t('ユーザのキック') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('ユーザをキックする')"
        :disabled="sending"
        data-testid="dialog-edit-kicked-user-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="block" />
      </UiButton>
    </template>

    <div class="edit-kicked-user-contexts">
      <DialogTargetContext
        v-if="floorTitle"
        :context-id="floorContextId"
        :label="$t('対象フロア')"
        :name="floorTitle"
      />
      <DialogTargetContext
        v-if="kickedUserName"
        :context-id="userContextId"
        :label="$t('対象ユーザ')"
        :name="kickedUserName"
      />
    </div>
    <p id="edit-kicked-user-dialog-description">
      {{ $t('対象ユーザのフロアおよびルームへのアクセスを禁止します') }}
    </p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="edit-kicked-user-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-edit-kicked-user-cancel-desktop"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          data-testid="dialog-edit-kicked-user-confirm-desktop"
          :disabled="sending"
          @click.stop="onPressDoneButton"
        >
          <UiIcon name="block" :size="18" />
          {{ $t('ユーザをキックする') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        aria-labelledby="edit-kicked-user-dialog-title"
      />
    </template>
  </UiDialog>
</template>

<script>
import kickedUserApi from '@/api/kickedUser';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['close'],
  name: 'EditKickedUserDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    roomId: String,
    floorTitle: {
      type: String,
      default: '',
    },
    kickedUserId: String,
    kickedUserName: String,
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
  computed: {
    floorContextId() {
      return 'edit_kicked_user_dialog_floor_context';
    },
    userContextId() {
      return 'edit_kicked_user_dialog_user_context';
    },
    descriptionIds() {
      return [
        this.floorTitle ? this.floorContextId : '',
        this.kickedUserName ? this.userContextId : '',
        'edit-kicked-user-dialog-description',
      ]
        .filter(Boolean)
        .join(' ');
    },
  },
  methods: {
    onPressDoneButton() {
      if (this.sending) return;
      this.createKickedUser();
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    createKickedUser() {
      if (this.sending || !this.kickedUserId || !this.roomId) return;
      this.sending = true;

      const data = {
        user_id: this.kickedUserId,
        room_id: this.roomId,
      };
      kickedUserApi
        .create(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then(() => {
          this.sending = false;

          this.setSnackbar(this.$t('ユーザをキックしました'), 'status');

          this.visible = false;
        })
        .catch((err) => {
          this.sending = false;
          let message = this.$t('ユーザのキックに失敗しました');
          message = appendApiErrorMessage(message, err, { translate: this.$t });

          this.setSnackbar(message, 'alert');

          return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          this.progressAmount = 0;
        });
    },

    closedDialog() {
      if (this.sending) return;

      this.$emit('close');
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
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

.edit-kicked-user-contexts {
  display: grid;
  gap: 8px;
}

@media screen and (max-width: 896px) {
  :global(.edit-kicked-user-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
