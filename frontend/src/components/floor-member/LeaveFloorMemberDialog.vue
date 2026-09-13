<template>
  <UiDialog
    class="leave-floor-member-dialog"
    ref="dialogRootRef"
    :open="visible"
    title-id="leave_floor_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus=".leave-floor-member-cancel"
    data-testid="dialog-leave-floor-member"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="leave-floor-member-cancel ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('キャンセル')"
        :disabled="sending"
        data-testid="dialog-leave-floor-member-cancel-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="leave_floor_member_dialog_title" class="ui-dialog__heading">
        {{ $t('フロアメンバー脱退') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="danger"
        icon-only
        :aria-label="$t('脱退')"
        :disabled="sending"
        data-testid="dialog-leave-floor-member-confirm-mobile"
        @click.stop="onPressDoneButton"
      >
        <UiIcon name="logout" />
      </UiButton>
    </template>

    <DialogTargetContext
      v-if="resolvedFloorTitle"
      :context-id="floorContextId"
      :label="$t('対象フロア')"
      :name="resolvedFloorTitle"
    />
    <p id="leave_floor_member_dialog_description">{{ $t('フロアメンバーから脱退する') }}</p>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="leave-floor-member-cancel desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-leave-floor-member-cancel-desktop"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('キャンセル') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="danger"
          data-testid="dialog-leave-floor-member-confirm-desktop"
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
        aria-labelledby="leave_floor_member_dialog_title"
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

export default {
  emits: ['close', 'success'],
  name: 'LeaveFloorMemberDialog',
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
    floorContextId() {
      return 'leave_floor_member_dialog_context';
    },
    descriptionIds() {
      return [
        this.resolvedFloorTitle ? this.floorContextId : '',
        'leave_floor_member_dialog_description',
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
    leaveFloorMember() {
      if (!this.resolvedFloorId) return;
      this.sending = true;

      floorMemberApi
        .leave(
          { floor_id: this.resolvedFloorId },
          {
            onUploadProgress: (progressEvent) => {
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          }
        )
        .then((res) => {
          this.setSnackbar(this.$t('フロアメンバーを脱退しました'), 'status');
          this.$emit('success', res.data);
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('フロアメンバーの脱退に失敗しました'), err, {
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
      this.leaveFloorMember();
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

@media screen and (max-width: 896px) {
  :global(.leave-floor-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
