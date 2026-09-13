<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('フロアタグ管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('フロアタグ') })"
    :fetcher="fetchFloorTag"
    :payload-builder="buildListPayload"
    :errorMessage="$t('フロアタグの取得に失敗しました')"
    :searchEnabled="true"
    :searchMinLength="2"
    :searchMaxLength="10"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('10文字以内です')"
  >
    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--wide">
          <thead>
            <tr>
              <th scope="col">{{ $t('表示順番') }}</th>
              <th scope="col">{{ $t('タグ名') }}</th>
              <th scope="col">{{ $t('フロア') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('managementUi.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="floorTag in items" :key="floorTag._id">
              <td :data-label="$t('表示順番')">{{ floorTag.order }}</td>
              <td :data-label="$t('タグ名')" dir="auto">{{ floorTag.name }}</td>
              <td :data-label="$t('フロア')" dir="auto">{{ floorTitle(floorTag) }}</td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(floorTag.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(floorTag.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('managementUi.actions')">
                <div class="management-row-actions-group">
                  <div class="management-row-actions">
                    <UiButton
                      data-testid="management-floortag-lifecycle"
                      :data-management-lifecycle-id="floorTag._id"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="danger"
                      :disabled="sending"
                      :aria-label="rowActionLabel('delete', floorTag)"
                      @click="showLifecycleDialog(floorTag)"
                    >
                      {{ $t('managementUi.delete') }}
                    </UiButton>
                    <UiButton
                      data-testid="management-floortag-edit"
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      :disabled="sending"
                      :aria-label="rowActionLabel('edit', floorTag)"
                      @click="showEditFloorTagDialog(floorTag)"
                    >
                      {{ $t('managementUi.edit') }}
                    </UiButton>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <EditFloorTagDialog
        :dialogVisible="editFloorTagDialogVisible"
        :floorTag="selectedFloorTag"
        :floor-name="floorTitle(selectedFloorTag)"
        :tag-name="selectedFloorTag?.name || ''"
        :managementMode="true"
        @success="successEditFloorTag"
        @close="closeEditFloorTag()"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        action="delete"
        :show-delete-recovery-note="false"
        :warning="$t('この操作は元に戻せません')"
        :resource-label="$t('フロアタグ')"
        :resource-name="lifecycleTarget.name"
        @confirm="deleteTag"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      >
        <dl class="management-detail-list">
          <div>
            <dt>{{ $t('フロア') }}</dt>
            <dd dir="auto">{{ floorTitle(lifecycleTarget) }}</dd>
          </div>
        </dl>
      </ManagementLifecycleDialog>
    </template>
  </ManagementListBase>
</template>

<script>
import tagApi from '@/api/tag';
import EditFloorTagDialog from '@/components/floor-tag/EditFloorTagDialog.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { closeTagEditDialog, showTagEditDialog } from '@/features/tag/shared/tagManagementView';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';

export default {
  name: 'FloorTagManagement',
  components: {
    EditFloorTagDialog,
    ManagementLifecycleDialog,
    ManagementListBase,
    UiButton,
  },
  data() {
    return {
      editFloorTagDialogVisible: false,
      selectedFloorTag: null,
      sending: false,
      lifecycleDialogVisible: false,
      lifecycleTarget: null,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
    };
  },
  methods: {
    ...createManagementDateFormatterMethods(),
    fetchFloorTag(payload) {
      return tagApi.floorTag.managementPaginate(payload);
    },
    buildListPayload({ page, search }) {
      return { page, search };
    },
    floorTitle(floorTag) {
      return floorTag?.floor?.title || this.$t('managementUi.referenceUnavailable');
    },
    rowActionLabel(action, floorTag) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('フロアタグ')}「${floorTag.name}」`;
    },

    showEditFloorTagDialog(data) {
      if (this.sending || !data) return;
      showTagEditDialog(this, { visibleKey: 'editFloorTagDialogVisible', selectedKey: 'selectedFloorTag' }, data);
    },
    successEditFloorTag() {
      this.closeEditFloorTag();
      return this.$refs.listBase.reload();
    },
    closeEditFloorTag() {
      closeTagEditDialog(this, { visibleKey: 'editFloorTagDialogVisible' });
    },
    showLifecycleDialog(floorTag) {
      if (this.sending || !floorTag) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(floorTag._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = floorTag;
      this.lifecycleDialogVisible = true;
    },
    async deleteTag() {
      if (this.sending || !this.lifecycleTarget) return;
      this.sending = true;
      try {
        await tagApi.floorTag.managementRemove({
          _id: this.lifecycleTarget._id,
        });
      } catch (error) {
        const failureMessage = this.$t('削除に失敗しました');
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
