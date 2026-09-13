<template>
  <UiDialog
    class="release-kicked-user-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="delete-kicked-user-dialog-title"
    :description-ids="descriptionIds"
    initial-focus=".release-kicked-user-cancel"
    data-testid="dialog-delete-kicked-user"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="release-kicked-user-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-delete-kicked-user-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="delete-kicked-user-dialog-title" class="ui-dialog__heading">
        {{ $t('ユーザのキック解除') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="$t('解除')"
        :disabled="sending"
        data-testid="dialog-delete-kicked-user-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="lock_open" />
      </UiButton>
    </template>

    <div class="release-kicked-user-contexts">
      <DialogTargetContext
        v-if="resolvedFloorTitle"
        :context-id="floorContextId"
        :label="$t('対象フロア')"
        :name="resolvedFloorTitle"
      />
      <DialogTargetContext
        v-if="resolvedUserName"
        :context-id="userContextId"
        :label="$t('対象ユーザ')"
        :name="resolvedUserName"
      />
    </div>
    <p id="delete-kicked-user-dialog-description">
      {{ $t('ユーザをフロアとルームに再び参加可能にします') }}
    </p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="release-kicked-user-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          data-testid="dialog-delete-kicked-user-cancel-desktop"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="sending"
          data-testid="dialog-delete-kicked-user-confirm-desktop"
          @click.stop="onPressDoneButton"
        >
          <UiIcon name="lock_open" :size="18" />
          {{ $t('解除') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        aria-labelledby="delete-kicked-user-dialog-title"
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
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'success'],
  name: 'DeleteKickedUserDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    floorId: {
      type: String,
      default: '',
    },
    floorTitle: {
      type: String,
      default: '',
    },
    kickedUser: {
      type: Object,
      default: null,
    },
    kickedUserId: {
      type: String,
      default: '',
    },
    kickedUserName: {
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
    resolvedFloorId() {
      return this.floorId || this.$store?.getters?.floorId || '';
    },
    resolvedFloorTitle() {
      return this.floorTitle || this.$store?.getters?.floorTitle || '';
    },
    resolvedUserId() {
      return this.kickedUser?.user?._id || this.kickedUserId;
    },
    resolvedUserName() {
      return this.resolveUserDisplayName(this.kickedUser?.user) || this.kickedUserName;
    },
    floorContextId() {
      return 'delete_kicked_user_dialog_floor_context';
    },
    userContextId() {
      return 'delete_kicked_user_dialog_user_context';
    },
    descriptionIds() {
      return [
        this.resolvedFloorTitle ? this.floorContextId : '',
        this.resolvedUserName ? this.userContextId : '',
        'delete-kicked-user-dialog-description',
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
    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    onPressDoneButton() {
      if (this.sending) return;
      this.releaseKickedUser();
    },

    releaseKickedUser() {
      if (!this.resolvedFloorId || !this.resolvedUserId) return;
      this.sending = true;

      kickedUserApi
        .remove(
          {
            floor_id: this.resolvedFloorId,
            user_id: this.resolvedUserId,
          },
          {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          }
        )
        .then((res) => {
          this.setSnackbar(this.$t('kickedUserDialogs.releaseSuccess'), 'status');
          this.$emit(
            'success',
            this.kickedUser || {
              user: {
                _id: this.resolvedUserId,
                username: this.resolvedUserName,
              },
            },
            res.data
          );
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('キック済みユーザの解除に失敗しました'), err, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
          return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          this.sending = false;
          this.progressAmount = 0;
        });
    },

    closedDialog() {
      if (!this.sending) this.$emit('close');
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

.release-kicked-user-contexts {
  display: grid;
  gap: 8px;
}

@media screen and (max-width: 896px) {
  :global(.release-kicked-user-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
