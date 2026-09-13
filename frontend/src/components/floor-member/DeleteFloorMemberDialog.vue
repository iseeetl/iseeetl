<template>
  <UiDialog
    class="delete-floor-member-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="delete_floor_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus=".delete-floor-member-cancel"
    data-testid="dialog-delete-floor-member"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="delete-floor-member-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-delete-floor-member-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="delete_floor_member_dialog_title" class="ui-dialog__heading">
        {{ $t('フロアメンバー削除') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('削除')"
        :disabled="sending"
        data-testid="dialog-delete-floor-member-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="delete" />
      </UiButton>
    </template>

    <div class="delete-floor-member-contexts">
      <DialogTargetContext
        v-if="resolvedFloorTitle"
        :context-id="floorContextId"
        :label="$t('対象フロア')"
        :name="resolvedFloorTitle"
      />
      <DialogTargetContext
        v-if="userName"
        :context-id="memberContextId"
        :label="$t('floorMemberDialogs.targetMember')"
        :name="userName"
      />
    </div>
    <p id="delete_floor_member_dialog_description">{{ $t('フロアメンバーから削除する') }}</p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="delete-floor-member-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="sending"
          data-testid="dialog-delete-floor-member-cancel-desktop"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          :disabled="sending"
          data-testid="dialog-delete-floor-member-confirm-desktop"
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
        aria-labelledby="delete_floor_member_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import floorMemberApi from '@/api/floorMember';
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
  name: 'DeleteFloorMemberDialog',
  components: {
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    propsFloorMember: {
      type: Object,
      default: null,
    },
    floorId: {
      type: String,
      default: '',
    },
    floorTitle: {
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
      return this.propsFloorMember?._id || null;
    },
    userName() {
      return this.resolveUserDisplayName(this.propsFloorMember?.user) || '';
    },
    resolvedFloorId() {
      return this.floorId || this.$store?.getters?.floorId || '';
    },
    resolvedFloorTitle() {
      return this.floorTitle || this.$store?.getters?.floorTitle || '';
    },
    floorContextId() {
      return 'delete_floor_member_dialog_floor_context';
    },
    memberContextId() {
      return 'delete_floor_member_dialog_member_context';
    },
    descriptionIds() {
      return [
        this.resolvedFloorTitle ? this.floorContextId : '',
        this.userName ? this.memberContextId : '',
        'delete_floor_member_dialog_description',
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
    deleteFloorMember() {
      if (!this.memberId || !this.resolvedFloorId) return;
      this.sending = true;

      const data = {
        _id: this.memberId,
        floor_id: this.resolvedFloorId,
      };
      floorMemberApi
        .remove(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          this.setSnackbar(this.$t('フロアメンバーを削除しました'), 'status');
          this.$emit('success', this.propsFloorMember, res.data);
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('フロアメンバーの削除に失敗しました'), err, {
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
      this.deleteFloorMember();
    },

    closedDialog() {
      if (!this.sending) this.$emit('close');
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

.delete-floor-member-contexts {
  display: grid;
  gap: 8px;
}

@media screen and (max-width: 896px) {
  :global(.delete-floor-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
