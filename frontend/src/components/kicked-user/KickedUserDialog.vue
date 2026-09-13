<template>
  <div>
    <BaseMemberDialog
      ref="dialogRootRef"
      :visible="dialogVisible"
      :sending="sending"
      title-id="kicked-user-dialog-title"
      :title-text="$t('キック済みユーザ一覧')"
      :description-ids="resolvedFloorTitle ? floorContextId : ''"
      :close-label="$t('閉じる')"
      :delete-label="$t('解除')"
      action-tone="primary"
      action-icon="lock_open"
      data-testid="dialog-kicked-user"
      test-id-prefix="dialog-kicked-user"
      :members="kickedUsers"
      :load-state="loadState"
      :loading-text="$t('読み込み中です')"
      :empty-text="$t('kickedUserDialogs.empty')"
      :error-text="$t('キック済みユーザの取得に失敗しました')"
      :retry-label="$t('再試行')"
      :summary-text="userSummaryText"
      :list-aria-label="$t('キック済みユーザ一覧')"
      :can-delete="canReleaseUser"
      :delete-aria-label="releaseUserAriaLabel"
      :progress-amount="progressAmount"
      @opened="openedDialog"
      @closed="closedDialog"
      @request-close="onPressCancelButton"
      @retry="fetchKickedUser"
      @delete="onPressReleaseButton"
    >
      <template #context>
        <DialogTargetContext
          v-if="resolvedFloorTitle"
          :context-id="floorContextId"
          :label="$t('対象フロア')"
          :name="resolvedFloorTitle"
        />
      </template>
    </BaseMemberDialog>
  </div>
</template>

<script>
import kickedUserApi from '@/api/kickedUser';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseMemberDialog from '@/components/common/BaseMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'release', 'request-close'],
  name: 'KickedUserDialog',
  components: {
    BaseMemberDialog,
    DialogTargetContext,
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
      kickedUsers: [],
      sending: false,
      progressAmount: 0,
      loadState: 'loading',
      loadRequestVersion: 0,
      loading: false,
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
      return 'kicked_user_dialog_context';
    },
    userSummaryText() {
      if (!['ready', 'empty'].includes(this.loadState)) return '';
      return this.$t('全{total}件', { total: this.kickedUsers.length }, this.kickedUsers.length);
    },
  },
  watch: {
    dialogVisible(value) {
      if (value) return;
      this.invalidateLoadRequests();
      this.loading = false;
    },
    floorId(nextId, previousId) {
      if (nextId === previousId) return;
      this.resetListState();
      if (this.dialogVisible) this.$nextTick(() => this.fetchKickedUser());
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
  },
  methods: {
    ...userDisplayMethods,
    openedDialog() {
      this.fetchKickedUser();
    },

    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },

    resetListState() {
      this.invalidateLoadRequests();
      this.kickedUsers = [];
      this.loadState = 'loading';
      this.loading = false;
      this.progressAmount = 0;
    },

    async fetchKickedUser() {
      if (this.loading) return;
      const requestVersion = ++this.loadRequestVersion;
      const requestedFloorId = this.resolvedFloorId;
      if (!requestedFloorId) {
        this.loadState = 'error';
        return;
      }

      this.loading = true;
      this.loadState = 'loading';
      this.progressAmount = 0;

      try {
        const res = await kickedUserApi.list(
          { floor_id: requestedFloorId },
          {
            onUploadProgress: (progressEvent) => {
              if (requestVersion !== this.loadRequestVersion) return;
              this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
            },
          }
        );
        if (
          requestVersion !== this.loadRequestVersion ||
          !this.dialogVisible ||
          this.resolvedFloorId !== requestedFloorId
        ) {
          return;
        }
        this.kickedUsers = Array.isArray(res.data) ? res.data : [];
        this.loadState = this.kickedUsers.length > 0 ? 'ready' : 'empty';
      } catch (err) {
        if (
          requestVersion !== this.loadRequestVersion ||
          !this.dialogVisible ||
          this.resolvedFloorId !== requestedFloorId
        ) {
          return;
        }
        this.loadState = 'error';
        const message = appendApiErrorMessage(this.$t('キック済みユーザの取得に失敗しました'), err, {
          translate: this.$t,
        });
        this.setSnackbar(message, 'alert');
        if (this.handleAuthError(err)) return;
      } finally {
        if (requestVersion === this.loadRequestVersion) {
          this.loading = false;
          this.progressAmount = 0;
        }
      }
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.$emit('request-close');
    },

    onPressReleaseButton(kickedUser) {
      this.$emit('release', kickedUser);
    },

    releaseUserAriaLabel(kickedUser) {
      return this.$t('kickedUserDialogs.releaseUserAria', {
        username: this.resolveUserDisplayName(kickedUser?.user) || '',
      });
    },

    canReleaseUser() {
      return true;
    },

    applyReleasedUser(userOrId) {
      const recordId = typeof userOrId === 'object' ? userOrId?._id : null;
      const userId = typeof userOrId === 'object' ? userOrId?.user?._id : userOrId;
      const removedIndex = this.kickedUsers.findIndex(
        (kickedUser) => kickedUser._id === recordId || kickedUser.user?._id === userId
      );
      if (removedIndex < 0) return false;

      this.kickedUsers.splice(removedIndex, 1);
      this.loadState = this.kickedUsers.length > 0 ? 'ready' : 'empty';
      this.$nextTick(() => {
        const nextUser = this.kickedUsers[removedIndex] || this.kickedUsers[removedIndex - 1] || null;
        const baseDialog = this.$refs.dialogRootRef;
        const focused = nextUser ? baseDialog?.focusDeleteButton(nextUser._id) : false;
        if (!focused) baseDialog?.focusHeading();
      });
      return true;
    },

    clearValue() {
      this.resetListState();
    },

    closedDialog() {
      this.clearValue();
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
