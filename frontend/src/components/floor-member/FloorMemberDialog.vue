<template>
  <div>
    <BaseMemberDialog
      ref="dialogRootRef"
      :visible="dialogVisible"
      :sending="sending"
      title-id="floor_member_dialog_title"
      :title-text="$t('フロアメンバー一覧')"
      :description-ids="resolvedFloorTitle ? floorContextId : ''"
      guidance-scope="floor"
      :close-label="$t('閉じる')"
      :delete-label="$t('削除')"
      data-testid="dialog-floor-member"
      test-id-prefix="dialog-floor-member"
      :members="floorMembers"
      :load-state="loadState"
      :loading-text="$t('読み込み中です')"
      :empty-text="$t('floorMemberDialogs.empty')"
      :error-text="$t('フロアメンバーの取得に失敗しました')"
      :retry-label="$t('再試行')"
      :summary-text="memberSummaryText"
      :list-aria-label="$t('フロアメンバー一覧')"
      :can-delete="canDeleteMember"
      :delete-aria-label="deleteMemberAriaLabel"
      :progress-amount="progressAmount"
      @opened="openedDialog"
      @closed="closedDialog"
      @request-close="onPressCancelButton"
      @retry="fetchFloorMember"
      @delete="onPressDeleteButton"
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
import floorMemberApi from '@/api/floorMember';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseMemberDialog from '@/components/common/BaseMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'delete', 'request-close'],
  name: 'FloorMemberDialog',
  components: {
    BaseMemberDialog,
    DialogTargetContext,
  },
  props: {
    dialogVisible: Boolean,
    propsRole: {
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
      role: null,
      floorMembers: [],
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
      return 'floor_member_dialog_context';
    },
    memberSummaryText() {
      if (!['ready', 'empty'].includes(this.loadState)) return '';
      return this.$t('全{total}件', { total: this.floorMembers.length }, this.floorMembers.length);
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
      if (this.dialogVisible) this.$nextTick(() => this.fetchFloorMember());
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
  },
  methods: {
    ...userDisplayMethods,
    openedDialog() {
      this.role = this.propsRole;
      this.fetchFloorMember();
    },

    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },

    resetListState() {
      this.invalidateLoadRequests();
      this.floorMembers = [];
      this.loadState = 'loading';
      this.loading = false;
      this.progressAmount = 0;
    },

    async fetchFloorMember() {
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
        const res = await floorMemberApi.list(
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
        this.floorMembers = Array.isArray(res.data) ? res.data : [];
        this.loadState = this.floorMembers.length > 0 ? 'ready' : 'empty';
      } catch (err) {
        if (
          requestVersion !== this.loadRequestVersion ||
          !this.dialogVisible ||
          this.resolvedFloorId !== requestedFloorId
        ) {
          return;
        }
        this.loadState = 'error';
        const message = appendApiErrorMessage(this.$t('フロアメンバーの取得に失敗しました'), err, {
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

    onPressDeleteButton(floorMember) {
      this.$emit('delete', floorMember);
    },

    deleteMemberAriaLabel(member) {
      return this.$t('floorMemberDialogs.deleteMemberAria', {
        username: this.resolveUserDisplayName(member?.user) || '',
      });
    },

    canDeleteMember() {
      return !!(this.role && (this.role.isAdmin || this.role.isFloorEditor));
    },

    applyDeletedMember(memberOrId) {
      const memberId = typeof memberOrId === 'object' ? memberOrId?._id : memberOrId;
      const removedIndex = this.floorMembers.findIndex((member) => member._id === memberId);
      if (removedIndex < 0) return false;

      this.floorMembers.splice(removedIndex, 1);
      this.loadState = this.floorMembers.length > 0 ? 'ready' : 'empty';
      this.$nextTick(() => {
        const nextMember = this.floorMembers[removedIndex] || this.floorMembers[removedIndex - 1] || null;
        const baseDialog = this.$refs.dialogRootRef;
        const focused = nextMember ? baseDialog?.focusDeleteButton(nextMember._id) : false;
        if (!focused) baseDialog?.focusHeading();
      });
      return true;
    },

    clearValue() {
      this.role = null;
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
