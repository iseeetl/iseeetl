<template>
  <div>
    <BaseMemberDialog
      ref="dialogRootRef"
      :visible="dialogVisible"
      :sending="sending"
      :title-id="'room_member_dialog_title'"
      :title-text="$t('ルームメンバー一覧')"
      :description-ids="roomTitle ? roomContextId : ''"
      guidance-scope="room"
      :close-label="$t('閉じる')"
      :delete-label="$t('削除')"
      data-testid="dialog-room-member"
      test-id-prefix="dialog-room-member"
      :members="roomMembers"
      :load-state="loadState"
      :loading-text="$t('読み込み中です')"
      :empty-text="$t('roomMemberDialogs.empty')"
      :error-text="$t('ルームメンバーの取得に失敗しました')"
      :retry-label="$t('再試行')"
      :summary-text="memberSummaryText"
      :list-aria-label="$t('ルームメンバー一覧')"
      :can-delete="canDeleteMember"
      :delete-aria-label="deleteMemberAriaLabel"
      :progress-amount="progressAmount"
      @opened="openedDialog"
      @closed="closedDialog"
      @request-close="onPressCancelButton"
      @retry="fetchRoomMember"
      @delete="onPressDeleteButton"
    >
      <template #context>
        <DialogTargetContext
          v-if="roomTitle"
          :context-id="roomContextId"
          :label="$t('対象ルーム')"
          :name="roomTitle"
        />
      </template>
    </BaseMemberDialog>
  </div>
</template>

<script>
import roomMemberApi from '@/api/roomMember';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseMemberDialog from '@/components/common/BaseMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  emits: ['close', 'delete', 'request-close'],
  name: 'RoomMemberDialog',
  components: {
    BaseMemberDialog,
    DialogTargetContext,
  },
  props: {
    dialogVisible: Boolean,
    canDeleteMembers: {
      type: Boolean,
      default: false,
    },
    roomId: {
      type: String,
      default: '',
    },
    roomTitle: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      roomMembers: [],

      sending: false,
      progressAmount: 0,
      loadState: 'loading',
      loadRequestVersion: 0,
      loading: false,
    };
  },
  computed: {
    roomContextId() {
      return 'room_member_dialog_context';
    },
    memberSummaryText() {
      if (!['ready', 'empty'].includes(this.loadState)) return '';
      return this.$t('全{total}件', { total: this.roomMembers.length }, this.roomMembers.length);
    },
  },
  watch: {
    dialogVisible(value) {
      if (value) return;
      this.invalidateLoadRequests();
      this.loading = false;
    },
    roomId(nextId, previousId) {
      if (nextId === previousId) return;
      this.resetListState();
      if (this.dialogVisible && nextId) this.$nextTick(() => this.fetchRoomMember());
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
  },
  methods: {
    ...userDisplayMethods,
    openedDialog() {
      this.fetchRoomMember();
    },

    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },

    resetListState() {
      this.invalidateLoadRequests();
      this.roomMembers = [];
      this.loadState = 'loading';
      this.loading = false;
      this.progressAmount = 0;
    },

    async fetchRoomMember() {
      if (this.loading) return;
      const requestVersion = ++this.loadRequestVersion;
      const requestedRoomId = this.roomId;
      if (!requestedRoomId) {
        this.loadState = 'error';
        return;
      }
      this.loading = true;
      this.loadState = 'loading';
      this.progressAmount = 0;

      const data = {
        room_id: requestedRoomId,
      };
      try {
        const res = await roomMemberApi.list(data, {
          onUploadProgress: (progressEvent) => {
            if (requestVersion !== this.loadRequestVersion) return;
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        });
        if (
          requestVersion !== this.loadRequestVersion ||
          !this.dialogVisible ||
          this.roomId !== requestedRoomId
        ) {
          return;
        }
        this.roomMembers = Array.isArray(res.data) ? res.data : [];
        this.loadState = this.roomMembers.length > 0 ? 'ready' : 'empty';
      } catch (err) {
        if (
          requestVersion !== this.loadRequestVersion ||
          !this.dialogVisible ||
          this.roomId !== requestedRoomId
        ) {
          return;
        }
        this.loadState = 'error';
        const message = appendApiErrorMessage(this.$t('ルームメンバーの取得に失敗しました'), err, {
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

    onPressDeleteButton(roomMember) {
      this.$emit('delete', roomMember);
    },
    deleteMemberAriaLabel(member) {
      return this.$t('roomMemberDialogs.deleteMemberAria', {
        username: this.resolveUserDisplayName(member?.user) || '',
      });
    },
    canDeleteMember() {
      return this.canDeleteMembers;
    },

    applyDeletedMember(memberOrId) {
      const memberId = typeof memberOrId === 'object' ? memberOrId?._id : memberOrId;
      const removedIndex = this.roomMembers.findIndex((member) => member._id === memberId);
      if (removedIndex < 0) return false;

      this.roomMembers.splice(removedIndex, 1);
      this.loadState = this.roomMembers.length > 0 ? 'ready' : 'empty';
      this.$nextTick(() => {
        const nextMember = this.roomMembers[removedIndex] || this.roomMembers[removedIndex - 1] || null;
        const baseDialog = this.$refs.dialogRootRef;
        const focused = nextMember ? baseDialog?.focusDeleteButton(nextMember._id) : false;
        if (!focused) baseDialog?.focusHeading();
      });
      return true;
    },

    clearValue() {
      this.resetListState();
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
