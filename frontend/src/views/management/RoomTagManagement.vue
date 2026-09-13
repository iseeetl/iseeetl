<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('ルームタグ管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('ルームタグ') })"
    :fetcher="fetchRoomTag"
    :payload-builder="buildListPayload"
    :errorMessage="$t('ルームタグの取得に失敗しました')"
    :searchEnabled="true"
    :searchMinLength="2"
    :searchMaxLength="10"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('10文字以内です')"
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
              <th scope="col">{{ $t('表示順番') }}</th>
              <th scope="col">{{ $t('タグ名') }}</th>
              <th scope="col">{{ $t('フロア') }}</th>
              <th scope="col">{{ $t('ルーム') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('managementUi.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="roomTag in items" :key="roomTag._id" :class="{ 'soft-delete': roomTag.delete_flg }">
              <td :data-label="$t('表示順番')">{{ roomTag.order }}</td>
              <td :data-label="$t('タグ名')" dir="auto">{{ roomTag.name }}</td>
              <td :data-label="$t('フロア')" dir="auto">{{ floorTitle(roomTag) }}</td>
              <td :data-label="$t('ルーム')" dir="auto">{{ roomTitle(roomTag) }}</td>
              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :label="$t(roomTag.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                    :tone="roomTag.delete_flg ? 'danger' : 'success'"
                  />
                  <ManagementStatusBadge
                    v-if="parentUnavailable(roomTag)"
                    :label="$t('managementUi.statusUnavailable')"
                    tone="warning"
                  />
                </div>
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(roomTag.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(roomTag.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(roomTag.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('managementUi.actions')">
                <div class="management-row-actions-group">
                  <div class="management-row-actions">
                    <UiButton
                      v-if="!roomTag.delete_flg"
                      data-testid="management-roomtag-lifecycle"
                      :data-management-lifecycle-id="roomTag._id"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="danger"
                      :disabled="sending"
                      :aria-label="rowActionLabel('delete', roomTag)"
                      @click="showLifecycleDialog(roomTag)"
                    >
                      {{ $t('managementUi.delete') }}
                    </UiButton>
                    <UiButton
                      v-if="!roomTag.delete_flg"
                      data-testid="management-roomtag-edit"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending"
                      :aria-label="rowActionLabel('edit', roomTag)"
                      @click="showEditRoomTagDialog(roomTag)"
                    >
                      {{ $t('managementUi.edit') }}
                    </UiButton>
                    <UiButton
                      v-else
                      data-testid="management-roomtag-lifecycle"
                      :data-management-lifecycle-id="roomTag._id"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending || restoreUnavailable(roomTag)"
                      :aria-label="rowActionLabel('restore', roomTag)"
                      :aria-describedby="restoreUnavailable(roomTag) ? unavailableReasonId(roomTag) : undefined"
                      @click="showLifecycleDialog(roomTag)"
                    >
                      {{ $t('managementUi.restore') }}
                    </UiButton>
                  </div>
                  <p
                    v-if="restoreUnavailable(roomTag)"
                    :id="unavailableReasonId(roomTag)"
                    class="management-action-reason"
                  >
                    {{ $t('managementUi.parentUnavailableReason') }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <EditRoomTagDialog
        :dialogVisible="editRoomTagDialogVisible"
        :roomTag="selectedRoomTag"
        :floor-name="floorTitle(selectedRoomTag)"
        :room-name="roomTitle(selectedRoomTag)"
        :tag-name="selectedRoomTag?.name || ''"
        :managementMode="true"
        :show-lifecycle-control="false"
        @success="successEditRoomTag"
        @close="closeEditRoomTag()"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        :action="lifecycleAction"
        :resource-label="$t('ルームタグ')"
        :resource-name="lifecycleTarget.name"
        @confirm="setDeleteState"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      >
        <dl class="management-detail-list">
          <div>
            <dt>{{ $t('フロア') }}</dt>
            <dd dir="auto">{{ floorTitle(lifecycleTarget) }}</dd>
          </div>
          <div>
            <dt>{{ $t('ルーム') }}</dt>
            <dd dir="auto">{{ roomTitle(lifecycleTarget) }}</dd>
          </div>
        </dl>
      </ManagementLifecycleDialog>
    </template>
  </ManagementListBase>
</template>

<script>
import tagApi from '@/api/tag';
import EditRoomTagDialog from '@/components/room-tag/EditRoomTagDialog.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import ManagementStatusFilter from '@/components/management/ManagementStatusFilter.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { closeTagEditDialog, showTagEditDialog } from '@/features/tag/shared/tagManagementView';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import { withDeleteFilter } from '@/features/management/lifecycle';

export default {
  name: 'RoomTagManagement',
  components: {
    EditRoomTagDialog,
    ManagementLifecycleDialog,
    ManagementListBase,
    ManagementStatusBadge,
    ManagementStatusFilter,
    UiButton,
  },
  data() {
    return {
      editRoomTagDialogVisible: false,
      selectedRoomTag: null,
      sending: false,
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
    ...createManagementDateFormatterMethods(),
    fetchRoomTag(payload) {
      return tagApi.roomTag.managementPaginate(payload);
    },
    buildListPayload({ page, search }) {
      return withDeleteFilter({ page, search }, this.statusFilter);
    },
    onStatusFilterChange(value) {
      this.statusFilter = value;
      return this.$refs.listBase.reloadFromFirstPage();
    },
    floorTitle(roomTag) {
      return roomTag?.floor?.title || this.$t('managementUi.referenceUnavailable');
    },
    roomTitle(roomTag) {
      return roomTag?.room?.title || this.$t('managementUi.referenceUnavailable');
    },
    referenceId(value) {
      if (value == null) return '';
      if (typeof value === 'object') return value._id ? String(value._id) : '';
      return String(value);
    },
    parentUnavailable(roomTag) {
      const floorId = this.referenceId(roomTag?.floor);
      const roomFloorId = this.referenceId(roomTag?.room?.floor);
      return (
        !roomTag?.floor ||
        roomTag.floor.delete_flg === true ||
        !roomTag.room ||
        roomTag.room.delete_flg === true ||
        !floorId ||
        !roomFloorId ||
        roomFloorId !== floorId
      );
    },
    restoreUnavailable(roomTag) {
      return Boolean(roomTag?.delete_flg && this.parentUnavailable(roomTag));
    },
    unavailableReasonId(roomTag) {
      return `management-roomtag-unavailable-${roomTag._id}`;
    },
    rowActionLabel(action, roomTag) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('ルームタグ')}「${roomTag.name}」`;
    },

    showEditRoomTagDialog(data) {
      if (this.sending || !data || data.delete_flg) return;
      showTagEditDialog(this, { visibleKey: 'editRoomTagDialogVisible', selectedKey: 'selectedRoomTag' }, data);
    },
    successEditRoomTag() {
      this.closeEditRoomTag();
      return this.$refs.listBase.reload();
    },
    closeEditRoomTag() {
      closeTagEditDialog(this, { visibleKey: 'editRoomTagDialogVisible' });
    },
    showLifecycleDialog(roomTag) {
      if (this.sending || !roomTag || this.restoreUnavailable(roomTag)) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(roomTag._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = roomTag;
      this.lifecycleDialogVisible = true;
    },
    async setDeleteState(action = this.lifecycleAction) {
      if (this.sending || !this.lifecycleTarget) return;
      if (action === 'restore' && this.restoreUnavailable(this.lifecycleTarget)) return;
      this.sending = true;
      try {
        await tagApi.roomTag.managementSetDeleteState({
          _id: this.lifecycleTarget._id,
          delete_flg: action === 'delete',
        });
      } catch (error) {
        const failureMessage =
          action === 'delete'
            ? this.$t('削除に失敗しました')
            : this.$t('復元に失敗しました');
        this.$refs.listBase.showError(failureMessage, error);
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
  },
};
</script>
