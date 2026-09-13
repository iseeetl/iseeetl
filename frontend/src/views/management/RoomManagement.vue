<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('ルーム管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('ルーム') })"
    :fetcher="fetchRoom"
    :payload-builder="buildListPayload"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('ルーム') })"
    :searchEnabled="true"
    :searchLabel="$t('検索')"
    :searchMinLength="2"
    :searchMaxLength="100"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('100文字以内です')"
  >
    <template #filters="{ fetching }">
      <ManagementStatusFilter
        v-model="statusFilter"
        :disabled="sending || fetching"
        @change="onStatusFilterChange"
      />
    </template>

    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--wide">
          <thead>
            <tr>
              <th scope="col">{{ $t('ルーム') }}</th>
              <th scope="col">{{ $t('フロア') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in items" :key="room._id" :class="{ 'soft-delete': room.delete_flg }">
              <td :data-label="$t('ルーム')" dir="auto">{{ room.title }}</td>
              <td :data-label="$t('フロア')" dir="auto">
                {{ room.floor?.title || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('ユーザ名')" dir="auto">
                {{ resolveUserDisplayName(room.user) || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :label="$t(room.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                    :tone="room.delete_flg ? 'danger' : 'success'"
                  />
                  <ManagementStatusBadge
                    :label="$t(room.room_display_hidden ? 'managementUi.statusHidden' : 'managementUi.statusVisible')"
                    :tone="room.room_display_hidden ? 'warning' : 'info'"
                  />
                  <ManagementStatusBadge
                    :label="$t(room.member_only ? 'managementUi.statusMembersOnly' : 'managementUi.statusPublic')"
                    :tone="room.member_only ? 'warning' : 'info'"
                  />
                  <ManagementStatusBadge
                    v-if="parentUnavailable(room)"
                    :label="$t('managementUi.statusUnavailable')"
                    tone="warning"
                  />
                </div>
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(room.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(room.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(room.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions-group">
                  <div class="management-row-actions">
                    <UiButton
                      v-if="!room.delete_flg"
                      data-testid="management-room-lifecycle"
                      :data-management-lifecycle-id="room._id"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="danger"
                      :disabled="sending"
                      :aria-label="rowActionLabel('delete', room)"
                      @click="showLifecycleDialog(room)"
                    >
                      {{ $t('managementUi.delete') }}
                    </UiButton>
                    <UiButton
                      v-if="!room.delete_flg"
                      data-testid="management-room-edit"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending"
                      :aria-label="rowActionLabel('edit', room)"
                      @click="showEditRoomDialog(room)"
                    >
                      {{ $t('managementUi.edit') }}
                    </UiButton>
                    <UiButton
                      v-else
                      data-testid="management-room-lifecycle"
                      :data-management-lifecycle-id="room._id"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending || isRestoreUnavailable(room)"
                      :aria-label="rowActionLabel('restore', room)"
                      :aria-describedby="isRestoreUnavailable(room) ? unavailableReasonId(room) : undefined"
                      @click="showLifecycleDialog(room)"
                    >
                      {{ $t('managementUi.restore') }}
                    </UiButton>
                  </div>
                  <span
                    v-if="isRestoreUnavailable(room)"
                    :id="unavailableReasonId(room)"
                    class="management-action-reason"
                  >
                    {{ $t('managementUi.parentUnavailableReason') }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <EditRoomDialog
        :dialogVisible="editRoomValue.dialogVisible"
        :room="editRoomValue"
        :managementMode="true"
        :show-lifecycle-control="false"
        @success="successEditRoom"
        @close="closeEditRoom"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        :action="lifecycleAction"
        :resource-label="$t('ルーム')"
        :resource-name="lifecycleTarget.title"
        @confirm="setDeleteState"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      />
    </template>
  </ManagementListBase>
</template>

<script>
import roomApi from '@/api/room';
import EditRoomDialog from '@/components/room/EditRoomDialog.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import ManagementStatusFilter from '@/components/management/ManagementStatusFilter.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { withDeleteFilter } from '@/features/management/lifecycle';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'RoomManagement',
  components: {
    EditRoomDialog,
    ManagementLifecycleDialog,
    ManagementListBase,
    ManagementStatusBadge,
    ManagementStatusFilter,
    UiButton,
  },
  data() {
    return {
      editRoomValue: {
        dialogVisible: false,
        _id: null,
        floor: null,
        title: null,
        description: null,
        image_name: null,
        lang: null,
        guest_reaction_only: false,
        member_only: false,
        notification: true,
        external_sns_button: false,
        room_display_hidden: false,
        delete_flg: false,
      },
      sending: false,
      dateTimeZone: 'Asia/Tokyo',
      statusFilter: 'all',
      lifecycleDialogVisible: false,
      lifecycleTarget: null,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
    };
  },
  computed: {
    lifecycleAction() {
      return this.lifecycleTarget?.delete_flg ? 'restore' : 'delete';
    },
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    fetchRoom(payload) {
      return roomApi.managementPaginate(payload);
    },
    buildListPayload({ page, search }) {
      return withDeleteFilter({ page, search }, this.statusFilter);
    },
    onStatusFilterChange(value) {
      this.statusFilter = value;
      return this.$refs.listBase.reloadFromFirstPage();
    },
    rowActionLabel(action, room) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('ルーム')}「${room.title}」`;
    },
    parentUnavailable(room) {
      return !room?.floor || room.floor.delete_flg === true;
    },
    isRestoreUnavailable(room) {
      return Boolean(room?.delete_flg && this.parentUnavailable(room));
    },
    unavailableReasonId(room) {
      return `room-management-unavailable-${room._id}`;
    },
    showEditRoomDialog(room) {
      if (this.sending || !room || room.delete_flg) return;
      this.editRoomValue._id = room._id;
      this.editRoomValue.floor = room.floor?._id || room.floor;
      this.editRoomValue.title = room.title;
      this.editRoomValue.description = room.description;
      this.editRoomValue.image_name = room.image_name;
      this.editRoomValue.lang = room.lang;
      this.editRoomValue.guest_reaction_only = room.guest_reaction_only;
      this.editRoomValue.member_only = room.member_only;
      this.editRoomValue.notification = room.notification;
      this.editRoomValue.external_sns_button = room.external_sns_button;
      this.editRoomValue.room_display_hidden = room.room_display_hidden;
      this.editRoomValue.delete_flg = room.delete_flg;
      this.editRoomValue.dialogVisible = true;
    },
    showLifecycleDialog(room) {
      if (this.sending || !room || this.isRestoreUnavailable(room)) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(room._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = room;
      this.lifecycleDialogVisible = true;
    },
    async setDeleteState(action = this.lifecycleAction) {
      if (this.sending || !this.lifecycleTarget || this.isRestoreUnavailable(this.lifecycleTarget)) return;
      this.sending = true;
      try {
        await roomApi.managementSetDeleteState({
          _id: this.lifecycleTarget._id,
          delete_flg: action === 'delete',
        });
      } catch (error) {
        this.$refs.listBase.showError(
          this.$t(action === 'delete' ? '削除に失敗しました' : '復元に失敗しました'),
          error
        );
        this.sending = false;
        return;
      }

      try {
        await this.$refs.listBase.reload();
      } catch {
        // 一覧の再取得で発生したエラーの表示は、ManagementListBaseに任せる。
      }
      this.sending = false;
      this.lifecycleFocusAfterMutation = true;
      this.clearLifecycleDialog();
    },
    clearLifecycleDialog() {
      if (this.sending) return;
      this.lifecycleDialogVisible = false;
    },
    handleLifecycleDialogClosed() {
      const focusRequest = this.lifecycleFocusAfterMutation ? this.lifecycleFocusRequest : null;
      this.lifecycleTarget = null;
      this.lifecycleFocusRequest = null;
      this.lifecycleFocusAfterMutation = false;
      if (focusRequest) this.$refs.listBase?.restoreLifecycleFocus?.(focusRequest);
    },
    successEditRoom() {
      this.$refs.listBase.reload();
      this.clearEditRoomValue();
    },
    closeEditRoom() {
      this.clearEditRoomValue();
    },
    clearEditRoomValue() {
      this.editRoomValue.dialogVisible = false;
      this.editRoomValue._id = null;
      this.editRoomValue.floor = null;
      this.editRoomValue.title = null;
      this.editRoomValue.description = null;
      this.editRoomValue.image_name = null;
      this.editRoomValue.lang = null;
      this.editRoomValue.guest_reaction_only = false;
      this.editRoomValue.member_only = false;
      this.editRoomValue.notification = true;
      this.editRoomValue.external_sns_button = false;
      this.editRoomValue.room_display_hidden = false;
      this.editRoomValue.delete_flg = false;
    },
  },
};
</script>
