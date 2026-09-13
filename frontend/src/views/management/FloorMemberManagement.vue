<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('フロアメンバー管理')"
    :table-label="$t('フロアメンバー一覧')"
    :fetcher="fetchFloorMember"
    :errorMessage="$t('フロアメンバーの取得に失敗しました')"
  >
    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--compact">
          <thead>
            <tr>
              <th scope="col">{{ $t('フロア') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in items" :key="member._id">
              <td :data-label="$t('フロア')" dir="auto">{{ floorTitle(member) }}</td>
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
                    :disabled="sending"
                    :aria-label="$t('「{container}」のメンバー「{user}」を削除', {
                      container: floorTitle(member),
                      user: memberUserName(member),
                    })"
                    @click="showDeleteFloorMemberDialog(member)"
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
        :open="deleteFloorMemberValue.dialogVisible"
        :sending="sending"
        title-id="floor-member-management-delete-dialog-title"
        :title="$t('フロアメンバー削除')"
        :resource-label="$t('対象フロア')"
        :resource-name="deleteFloorMemberValue.floorTitle || ''"
        :user-name="deleteFloorMemberValue.username || ''"
        :message="
          $t('「{container}」からメンバー「{user}」を削除します', {
            container: deleteFloorMemberValue.floorTitle || '',
            user: deleteFloorMemberValue.username || '',
          })
        "
        test-id-prefix="management-floor-member-delete"
        @cancel="closeDeleteFloorMemberDialog"
        @confirm="deleteFloorMember"
        @request-close="closeDeleteFloorMemberDialog"
      />
    </template>
  </ManagementListBase>
</template>

<script>
import floorMemberApi from '@/api/floorMember';
import ManagementMemberDeleteDialog from '@/components/management/ManagementMemberDeleteDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'FloorMemberManagement',
  components: {
    ManagementMemberDeleteDialog,
    ManagementListBase,
    UiButton,
  },
  data() {
    return {
      sending: false,

      deleteFloorMemberValue: {
        dialogVisible: false,
        _id: null,
        username: null,
        floorTitle: null,
      },
    };
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchFloorMember(payload) {
      return floorMemberApi.managementPaginate(payload);
    },
    floorTitle(member) {
      return member?.floor?.title || this.$t('managementUi.referenceUnavailable');
    },
    memberUserName(member) {
      return this.resolveUserDisplayName(member?.user) || this.$t('managementUi.referenceUnavailable');
    },

    showDeleteFloorMemberDialog(val) {
      if (!val?._id) return;
      this.deleteFloorMemberValue.dialogVisible = true;
      this.deleteFloorMemberValue._id = val._id;
      this.deleteFloorMemberValue.username = this.memberUserName(val);
      this.deleteFloorMemberValue.floorTitle = this.floorTitle(val);
    },

    async deleteFloorMember() {
      if (this.sending) return;
      this.sending = true;
      const data = {
        _id: this.deleteFloorMemberValue._id,
      };
      let mutationSucceeded = false;
      try {
        await floorMemberApi.managementDelete(data);
        mutationSucceeded = true;
        await this.$refs.listBase.reload();
      } catch (e) {
        if (!mutationSucceeded) {
          this.$refs.listBase.showError(this.$t('フロアメンバーの削除に失敗しました'), e);
        }
      } finally {
        this.sending = false;
        if (mutationSucceeded) this.closeDeleteFloorMemberDialog();
      }
    },
    closeDeleteFloorMemberDialog() {
      if (this.sending) return;
      this.deleteFloorMemberValue.dialogVisible = false;
      this.deleteFloorMemberValue._id = null;
      this.deleteFloorMemberValue.username = null;
      this.deleteFloorMemberValue.floorTitle = null;
    },
  },
};
</script>
