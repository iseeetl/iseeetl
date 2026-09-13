<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('ルームメンバー管理')"
    :table-label="$t('ルームメンバー一覧')"
    :fetcher="fetchRoomMember"
    :errorMessage="$t('ルームメンバーの取得に失敗しました')"
  >
    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--compact">
          <thead>
            <tr>
              <th scope="col">{{ $t('ルーム') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in items" :key="member._id">
              <td :data-label="$t('ルーム')" dir="auto">{{ roomTitle(member) }}</td>
              <td :data-label="$t('ユーザ名')" dir="auto">{{ memberUserName(member) }}</td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(member.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions">
                  <UiButton
                    class="management-row-action-button"
                    appearance="filled"
                    tone="danger"
                    :aria-label="$t('「{container}」のメンバー「{user}」を削除', {
                      container: roomTitle(member),
                      user: memberUserName(member),
                    })"
                    @click="showDeleteRoomMemberDialog(member)"
                  >
                    {{ $t('managementUi.delete') }}
                  </UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <ManagementMemberDeleteDialog
        :open="deleteRoomMemberValue.dialogVisible"
        :sending="sending"
        title-id="room-member-management-delete-dialog-title"
        :title="$t('ルームメンバー削除')"
        :resource-label="$t('対象ルーム')"
        :resource-name="deleteRoomMemberValue.roomTitle || ''"
        :user-name="deleteRoomMemberValue.username || ''"
        :message="
          $t('「{container}」からメンバー「{user}」を削除します', {
            container: deleteRoomMemberValue.roomTitle || '',
            user: deleteRoomMemberValue.username || '',
          })
        "
        test-id-prefix="management-room-member-delete"
        @cancel="closeDeleteRoomMemberDialog"
        @confirm="deleteRoomMember"
        @request-close="closeDeleteRoomMemberDialog"
      />
    </template>
  </ManagementListBase>
</template>

<script>
import roomMemberApi from '@/api/roomMember';
import ManagementMemberDeleteDialog from '@/components/management/ManagementMemberDeleteDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'RoomMemberManagement',
  components: {
    ManagementMemberDeleteDialog,
    ManagementListBase,
    UiButton,
  },

  data() {
    return {
      deleteRoomMemberValue: {
        dialogVisible: false,
        _id: null,
        username: null,
        roomTitle: null,
      },
      sending: false,
    };
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchRoomMember(payload) {
      return roomMemberApi.managementPaginate(payload);
    },
    roomTitle(member) {
      return member?.room?.title || this.$t('managementUi.referenceUnavailable');
    },
    memberUserName(member) {
      return this.resolveUserDisplayName(member?.user) || this.$t('managementUi.referenceUnavailable');
    },

    showDeleteRoomMemberDialog(val) {
      if (!val) return;
      this.deleteRoomMemberValue.dialogVisible = true;
      this.deleteRoomMemberValue._id = val._id;
      this.deleteRoomMemberValue.username = this.memberUserName(val);
      this.deleteRoomMemberValue.roomTitle = this.roomTitle(val);
    },

    async deleteRoomMember() {
      if (this.sending) return;
      this.sending = true;

      const data = {
        _id: this.deleteRoomMemberValue._id,
      };
      let mutationSucceeded = false;
      try {
        await roomMemberApi.managementDelete(data);
        mutationSucceeded = true;
        await this.$refs.listBase.reload();
      } catch (e) {
        if (!mutationSucceeded) {
          this.$refs.listBase.showError(this.$t('ルームメンバーの削除に失敗しました'), e);
        }
      } finally {
        this.sending = false;
        if (mutationSucceeded) this.closeDeleteRoomMemberDialog();
      }
    },
    closeDeleteRoomMemberDialog() {
      if (this.sending) return;
      this.deleteRoomMemberValue.dialogVisible = false;
      this.deleteRoomMemberValue._id = null;
      this.deleteRoomMemberValue.username = null;
      this.deleteRoomMemberValue.roomTitle = null;
    },
  },
};
</script>
