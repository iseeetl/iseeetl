<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('フロア管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('フロア') })"
    :fetcher="fetchFloors"
    :payload-builder="buildListPayload"
    :errorMessage="$t('フロアの取得に失敗しました')"
    :searchEnabled="true"
    :searchLabel="$t('検索')"
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
        <table v-bind="tableAttrs" class="management-table management-table--wide floor-management-table">
          <thead>
            <tr>
              <th scope="col">{{ $t('タイトル') }}</th>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="floor in items" :key="floor._id" :class="{ 'soft-delete': floor.delete_flg }">
              <td :data-label="$t('タイトル')" dir="auto">{{ floor.title }}</td>
              <td :data-label="$t('ユーザ名')" dir="auto">
                {{ resolveUserDisplayName(floor.user) || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('managementUi.status')">
                <div class="management-status-list">
                  <ManagementStatusBadge
                    :label="$t(floor.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                    :tone="floor.delete_flg ? 'danger' : 'success'"
                  />
                  <ManagementStatusBadge
                    :label="$t(floor.floor_display_hidden ? 'managementUi.statusHidden' : 'managementUi.statusVisible')"
                    :tone="floor.floor_display_hidden ? 'warning' : 'info'"
                  />
                </div>
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(floor.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(floor.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(floor.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions">
                  <UiButton
                    v-if="!floor.delete_flg"
                    data-testid="management-floor-lifecycle"
                    :data-management-lifecycle-id="floor._id"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="danger"
                    :disabled="sending"
                    :aria-label="rowActionLabel('delete', floor)"
                    @click="showLifecycleDialog(floor)"
                  >
                    {{ $t('managementUi.delete') }}
                  </UiButton>
                  <UiButton
                    v-if="!floor.delete_flg"
                    data-testid="management-floor-edit"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="primary"
                    :disabled="sending"
                    :aria-label="rowActionLabel('edit', floor)"
                    @click="showEditFloorDialog(floor)"
                  >
                    {{ $t('managementUi.edit') }}
                  </UiButton>
                  <UiButton
                    v-else
                    data-testid="management-floor-lifecycle"
                    :data-management-lifecycle-id="floor._id"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="primary"
                    :disabled="sending"
                    :aria-label="rowActionLabel('restore', floor)"
                    @click="showLifecycleDialog(floor)"
                  >
                    {{ $t('managementUi.restore') }}
                  </UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <EditFloorDialog
        :dialogVisible="editFloorValue.dialogVisible"
        :propsFloor="editFloorValue"
        :managementMode="true"
        :show-lifecycle-control="false"
        @success="successEditFloor"
        @close="closeEditFloor"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        :action="lifecycleAction"
        :resource-label="$t('フロア')"
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
import floorApi from '@/api/floor';
import EditFloorDialog from '@/components/floor/EditFloorDialog.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import ManagementStatusFilter from '@/components/management/ManagementStatusFilter.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { withDeleteFilter } from '@/features/management/lifecycle';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'FloorManagement',
  components: {
    EditFloorDialog,
    ManagementLifecycleDialog,
    ManagementListBase,
    ManagementStatusBadge,
    ManagementStatusFilter,
    UiButton,
  },
  data() {
    return {
      editFloorValue: {
        dialogVisible: false,
        _id: null,
        title: null,
        description: null,
        image_name: null,
        floor_display_hidden: false,
        delete_flg: null,
        lang: null,
        target_langs: [],
        translations: [],
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
    fetchFloors(payload) {
      return floorApi.managementPaginate(payload);
    },
    buildListPayload({ page, search }) {
      return withDeleteFilter({ page, search }, this.statusFilter);
    },
    onStatusFilterChange(value) {
      this.statusFilter = value;
      return this.$refs.listBase.reloadFromFirstPage();
    },
    rowActionLabel(action, floor) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('フロア')}「${floor.title}」`;
    },
    showEditFloorDialog(floor) {
      if (this.sending || !floor || floor.delete_flg) return;
      this.editFloorValue._id = floor._id;
      this.editFloorValue.title = floor.title;
      this.editFloorValue.description = floor.description;
      this.editFloorValue.image_name = floor.image_name;
      this.editFloorValue.floor_display_hidden = floor.floor_display_hidden;
      this.editFloorValue.delete_flg = floor.delete_flg;
      this.editFloorValue.lang = floor.lang || 'ja';
      this.editFloorValue.target_langs = Array.isArray(floor.target_langs) ? [...floor.target_langs] : [];
      this.editFloorValue.translations = Array.isArray(floor.translations) ? [...floor.translations] : [];
      this.editFloorValue.dialogVisible = true;
    },
    showLifecycleDialog(floor) {
      if (this.sending || !floor) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(floor._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = floor;
      this.lifecycleDialogVisible = true;
    },
    async setDeleteState(action = this.lifecycleAction) {
      if (this.sending || !this.lifecycleTarget) return;
      this.sending = true;
      try {
        await floorApi.managementSetDeleteState({
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
    successEditFloor() {
      this.clearEditFloorValue();
      this.$refs.listBase.reload();
    },
    closeEditFloor() {
      this.clearEditFloorValue();
    },
    clearEditFloorValue() {
      this.editFloorValue.dialogVisible = false;
      this.editFloorValue._id = null;
      this.editFloorValue.title = null;
      this.editFloorValue.description = null;
      this.editFloorValue.image_name = null;
      this.editFloorValue.floor_display_hidden = false;
      this.editFloorValue.delete_flg = null;
      this.editFloorValue.lang = null;
      this.editFloorValue.target_langs = [];
      this.editFloorValue.translations = [];
    },
  },
};
</script>
