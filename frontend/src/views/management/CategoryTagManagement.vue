<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('共通タグ管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('共通タグ') })"
    :fetcher="fetchCategoryTag"
    :payload-builder="buildListPayload"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('共通タグ') })"
    :searchEnabled="true"
    :searchMaxLength="50"
    :searchMaxErrorText="$t('50文字まで')"
  >
    <template #header="{ fetching }">
      <div class="category-tag-management__header">
        <h1 class="view-title" tabindex="-1">{{ $t('共通タグ管理') }}</h1>
        <UiButton
          class="category-tag-management__create-button"
          data-testid="management-categorytag-create"
          appearance="filled"
          tone="primary"
          :disabled="sending || fetching"
          @click="showEditCategoryTagDialog()"
        >
          {{ $t('作成') }}
        </UiButton>
      </div>
    </template>

    <template #actions="{ fetching }">
      <section class="category-tag-management__csv-tools" aria-labelledby="category-tag-csv-tools-title">
        <h2 id="category-tag-csv-tools-title" class="category-tag-management__csv-title">
          {{ $t('CSV入出力') }}
        </h2>
        <div class="category-tag-management__csv-actions">
          <input
            id="csvupload"
            ref="csvInput"
            class="display-none-input"
            data-testid="management-categorytag-import-file"
            type="file"
            accept=".csv,text/csv"
            :disabled="sending || fetching"
            @change="onFileChange"
          />
          <UiButton
            ref="csvImportTrigger"
            data-testid="management-categorytag-import"
            appearance="filled"
            tone="neutral"
            :disabled="sending || fetching"
            @click="onPressCsvImportButton"
          >
            {{ $t('managementUi.importCsv') }}
          </UiButton>
          <UiButton
            data-testid="management-categorytag-export"
            appearance="filled"
            tone="neutral"
            :disabled="sending || fetching"
            @click="onPressOutputButton"
          >
            {{ $t('managementUi.exportCsv') }}
          </UiButton>
        </div>
      </section>
    </template>

    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--wide">
          <thead>
            <tr>
              <th scope="col">{{ $t('表示順番') }}</th>
              <th scope="col">{{ $t('タグ名') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('managementUi.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="categoryTag in items"
              :key="categoryTag._id"
            >
              <td :data-label="$t('表示順番')">{{ categoryTag.order }}</td>
              <td :data-label="$t('タグ名')" dir="auto">{{ categoryTag.name }}</td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(categoryTag.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(categoryTag.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('managementUi.actions')">
                <div class="management-row-actions">
                  <UiButton
                    data-testid="management-categorytag-lifecycle"
                    :data-management-lifecycle-id="categoryTag._id"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="danger"
                    :disabled="sending"
                    :aria-label="rowActionLabel('delete', categoryTag)"
                    @click="showLifecycleDialog(categoryTag)"
                  >
                    {{ $t('managementUi.delete') }}
                  </UiButton>
                  <UiButton
                    data-testid="management-categorytag-edit"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="primary"
                    :disabled="sending"
                    :aria-label="rowActionLabel('edit', categoryTag)"
                    @click="showEditCategoryTagDialog(categoryTag)"
                  >
                    {{ $t('managementUi.edit') }}
                  </UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <BaseEditDialog
        class="category-tag-form-dialog"
        :visible="dialogVisible"
        :sending="sending"
        title-id="category-tag-management-dialog-title"
        :title-text="categoryTagDialogTitle"
        :description-ids="categoryTagDialogDescriptionIds"
        :cancel-label="$t('キャンセル')"
        :confirm-label="categoryTagSubmitLabel"
        confirm-test-id="management-categorytag-submit"
        actions-adjacent
        initial-focus="#category-tag-order"
        progress-mode="indeterminate"
        @update:visible="dialogVisible = $event"
        @cancel="requestCloseCategoryTagDialog"
        @closed="handleCategoryTagDialogClosed"
        @confirm="editCategoryTag"
      >
        <DialogTargetContext
          v-if="categoryTagEditing"
          context-id="category-tag-management-target-context"
          class="category-tag-target-context"
          :label="$t('対象タグ')"
          :name="selectedCategoryTagName"
        />

        <UiField v-slot="{ controlAttrs }" control-id="category-tag-order" :label="$t('表示順番')">
          <input v-bind="controlAttrs" v-model="order" type="number" :disabled="sending" min="1" max="100" step="1" />
        </UiField>
        <UiField
          v-slot="{ controlAttrs }"
          control-id="category-tag-name"
          counter
          :label="$t('タグ名')"
          :invalid="v$.name.$dirty && v$.name.$invalid"
          :error="nameError"
        >
          <input
            v-bind="controlAttrs"
            v-model="name"
            dir="auto"
            maxlength="50"
            :disabled="sending"
            @blur="v$.name.$touch()"
          />
        </UiField>
      </BaseEditDialog>

      <ConfirmDialog
        :dialog-visible="discardConfirmVisible"
        :title="$t('破棄')"
        :message="$t('変更内容を破棄しますか？')"
        :confirm-label="$t('破棄')"
        :cancel-label="$t('キャンセル')"
        :sending="false"
        :actions-adjacent="true"
        :close-on-escape="true"
        :close-on-backdrop="true"
        confirm-icon="delete"
        @confirm="confirmDiscardChanges"
        @cancel="cancelDiscardChanges"
        @closed="handleDiscardConfirmationClosed"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        action="delete"
        :show-delete-recovery-note="false"
        :warning="$t('この操作は元に戻せません')"
        :resource-label="$t('共通タグ')"
        :resource-name="lifecycleTarget.name"
        @confirm="deleteTag"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      />

      <ConfirmDialog
        v-if="pendingImportRows.length"
        class="category-tag-import-dialog"
        :dialog-visible="importDialogVisible"
        :sending="sending"
        :title="$t('managementUi.importPreviewTitle')"
        title-id="category-tag-import-dialog-title"
        :cancel-label="$t('managementUi.importCancel')"
        :confirm-label="$t(sending ? 'managementUi.importing' : 'managementUi.importCsv')"
        cancel-test-id="management-categorytag-import-cancel"
        confirm-test-id="management-categorytag-import-confirm"
        :actions-adjacent="true"
        :close-on-confirm="false"
        :close-on-escape="true"
        :close-on-backdrop="true"
        initial-focus="[data-testid='management-categorytag-import-cancel']"
        confirm-icon="upload_file"
        confirm-tone="danger"
        progress-mode="indeterminate"
        @cancel="cancelCsvImport"
        @closed="handleImportDialogClosed"
        @confirm="confirmCsvImport"
      >
        <div class="category-tag-import-contexts">
          <DialogTargetContext
            context-id="category-tag-import-file-context"
            :label="$t('managementUi.importFileLabel')"
            :name="pendingImportFileName || '—'"
          />
          <DialogTargetContext
            context-id="category-tag-import-count-context"
            :label="$t('managementUi.importCountLabel')"
            :name="$t('managementUi.importPreviewCount', { count: pendingImportRows.length })"
          />
        </div>
        <p id="category-tag-import-warning">{{ $t('managementUi.importReplaceWarning') }}</p>
        <p>{{ $t('この操作は元に戻せません') }}</p>
      </ConfirmDialog>
    </template>
  </ManagementListBase>
</template>

<script>
import tagApi from '@/api/tag';
import {
  buildTagCsvText,
  buildTagUpsertPayload,
  downloadCsvFile,
  normalizeTagOrderInput,
  parseAndValidateTagCsv,
} from '@/features/tag/shared/tagCore';
import { runWithSendingAndProgress } from '@/features/tag/shared/tagAsync';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';

export default {
  name: 'CategoryTagManagement',
  components: {
    BaseEditDialog,
    ConfirmDialog,
    DialogTargetContext,
    ManagementLifecycleDialog,
    ManagementListBase,
    UiButton,
    UiField,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      dateTimeZone: 'Asia/Tokyo',

      dialogVisible: false,
      id: null,
      order: null,
      name: null,
      initialCategoryTagForm: null,
      selectedCategoryTagName: '',
      discardConfirmVisible: false,
      discardClosePending: false,

      sending: false,
      lifecycleDialogVisible: false,
      lifecycleTarget: null,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
      importDialogVisible: false,
      importCloseCleanupPending: false,
      pendingImportRows: [],
      pendingImportFileName: '',
      importReadRequestId: 0,
    };
  },
  beforeUnmount() {
    this.importReadRequestId += 1;
  },
  validations: {
    name: {
      required,
      maxLength: maxLength(50),
    },
  },
  computed: {
    categoryTagEditing() {
      return this.id !== null;
    },
    categoryTagDialogTitle() {
      return `${this.$t('共通タグ')} - ${this.$t(this.categoryTagEditing ? '編集' : '作成')}`;
    },
    categoryTagSubmitLabel() {
      return this.$t(this.categoryTagEditing ? 'managementUi.save' : '作成');
    },
    categoryTagDialogDescriptionIds() {
      return this.categoryTagEditing ? 'category-tag-management-target-context' : '';
    },
    categoryTagFormDirty() {
      if (!this.initialCategoryTagForm) return false;
      return (
        this.normalizedCategoryTagOrder(this.order) !== this.initialCategoryTagForm.order ||
        (this.name || '') !== this.initialCategoryTagForm.name
      );
    },
    nameError() {
      if (!this.v$.name.$dirty) return '';
      if (this.v$.name.required.$invalid) return this.$t('必須');
      if (this.v$.name.maxLength.$invalid) return this.$t('50文字まで');
      return '';
    },
  },
  methods: {
    ...createManagementDateFormatterMethods(),
    fetchCategoryTag(payload) {
      return tagApi.categoryTag.paginate(payload);
    },
    buildListPayload({ page, search }) {
      return { page, search };
    },
    rowActionLabel(action, categoryTag) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('共通タグ')}「${categoryTag.name}」`;
    },

    showEditCategoryTagDialog(categoryTag = null) {
      if (this.sending) return;
      this.dialogVisible = true;
      if (categoryTag) {
        this.id = categoryTag._id;
        this.order = categoryTag.order;
        this.name = categoryTag.name;
        this.selectedCategoryTagName = categoryTag.name || '';
      } else {
        this.v$.$reset();
        this.id = null;
        this.order = null;
        this.name = null;
        this.selectedCategoryTagName = '';
      }
      this.captureInitialCategoryTagForm();
    },
    normalizedCategoryTagOrder(value) {
      return value === null || value === undefined ? '' : String(value);
    },
    captureInitialCategoryTagForm() {
      this.initialCategoryTagForm = {
        order: this.normalizedCategoryTagOrder(this.order),
        name: this.name || '',
      };
    },
    requestCloseCategoryTagDialog() {
      if (this.sending) return;
      if (this.categoryTagFormDirty) {
        this.discardClosePending = false;
        this.discardConfirmVisible = true;
        return;
      }
      this.closeCategoryTagDialog();
    },
    confirmDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardConfirmVisible = false;
      this.discardClosePending = true;
    },
    cancelDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
    },
    handleDiscardConfirmationClosed() {
      if (!this.discardClosePending) return;
      this.discardClosePending = false;
      this.closeCategoryTagDialog();
    },
    showLifecycleDialog(categoryTag) {
      if (this.sending || !categoryTag) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(categoryTag._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = categoryTag;
      this.lifecycleDialogVisible = true;
    },
    async deleteTag() {
      if (this.sending || !this.lifecycleTarget) return;
      this.sending = true;
      try {
        await tagApi.categoryTag.remove({
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

    async editCategoryTag() {
      this.v$.$touch();
      if (this.v$.$invalid) return;
      if (this.sending) return;
      this.sending = true;

      const normalizedOrder = normalizeTagOrderInput(this.order, {
        min: 1,
        max: 100,
        fallback: 100,
      });
      if (!normalizedOrder.valid) {
        this.sending = false;
        this.$refs.listBase.showSnackbar(this.$t('表示順番は1以上、100以下の整数です'));
        return;
      }
      this.order = normalizedOrder.value;

      const data = buildTagUpsertPayload({
        scope: 'category',
        scopeId: null,
        tagId: this.id,
        order: this.order,
        name: this.name,
        managementMode: this.id !== null,
      });
      const isCreating = this.id === null;

      try {
        if (isCreating) {
          await tagApi.categoryTag.create(data);
        } else {
          await tagApi.categoryTag.update(data);
        }
      } catch (error) {
        this.$refs.listBase.showError(
          this.$t(isCreating ? '作成に失敗しました' : '更新に失敗しました'),
          error,
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
      this.closeCategoryTagDialog();
    },
    closeCategoryTagDialog() {
      if (this.sending) return;
      this.dialogVisible = false;
    },
    handleCategoryTagDialogClosed() {
      this.clearEditCategoryTagValue();
    },
    clearEditCategoryTagValue() {
      if (this.sending) return;
      this.v$.$reset();
      this.dialogVisible = false;
      this.id = null;
      this.order = null;
      this.name = null;
      this.initialCategoryTagForm = null;
      this.selectedCategoryTagName = '';
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
    },

    onPressCsvImportButton() {
      if (this.sending) return;
      this.$refs.csvInput?.click();
    },
    onFileChange(event) {
      if (this.sending) return;
      const readRequestId = ++this.importReadRequestId;
      const file = event.target.files[0];
      if (!file) {
        this.clearPendingImport();
        return;
      }
      this.pendingImportRows = [];
      this.pendingImportFileName = '';
      this.importDialogVisible = false;
      this.importCloseCleanupPending = false;
      const reader = new FileReader();

      reader.onload = (e) => {
        if (readRequestId !== this.importReadRequestId) return;
        const parsed = parseAndValidateTagCsv(e.target.result, {
          minOrder: 1,
          maxOrder: 100,
          maxNameLength: 50,
        });
        if (!parsed.isValid) {
          this.clearPendingImport();
          this.$refs.listBase.showSnackbar(this.$t('CSVファイルのインポートに失敗しました'));
          return;
        }
        this.pendingImportRows = parsed.rows;
        this.pendingImportFileName = file.name || '';
        this.importDialogVisible = true;
      };

      reader.onerror = () => {
        if (readRequestId !== this.importReadRequestId) return;
        this.clearPendingImport();
        this.$refs.listBase.showSnackbar(this.$t('CSVファイルの読み込みに失敗しました'));
      };
      reader.readAsText(file);
    },
    async confirmCsvImport() {
      if (this.sending || !this.pendingImportRows.length) return;
      this.sending = true;
      try {
        await tagApi.categoryTag.importCsv({ csv: this.pendingImportRows });
      } catch (error) {
        this.$refs.listBase.showError(this.$t('CSVファイルのインポートに失敗しました'), error);
        this.sending = false;
        return;
      }
      try {
        await this.$refs.listBase.reloadFromFirstPage();
      } catch {
        // 一覧取得エラーの表示と再試行は、ManagementListBaseに任せる。
      }
      this.$refs.listBase.showSnackbar(this.$t('CSVファイルをインポートしました'));
      this.sending = false;
      this.requestCloseImportDialog();
    },
    cancelCsvImport() {
      if (this.sending) return;
      this.requestCloseImportDialog();
    },
    requestCloseImportDialog() {
      if (this.sending || !this.importDialogVisible) return;
      this.importCloseCleanupPending = true;
      this.importDialogVisible = false;
    },
    handleImportDialogClosed() {
      if (!this.importCloseCleanupPending) return;
      this.importCloseCleanupPending = false;
      this.clearPendingImport();
      this.$nextTick(() => {
        const trigger = this.$refs.csvImportTrigger?.$el || this.$refs.csvImportTrigger;
        if (trigger && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
      });
    },
    clearPendingImport() {
      if (this.sending) return;
      this.importReadRequestId += 1;
      this.importDialogVisible = false;
      this.importCloseCleanupPending = false;
      this.pendingImportRows = [];
      this.pendingImportFileName = '';
      const input = this.$refs.csvInput;
      if (input) input.value = '';
    },

    onPressOutputButton() {
      if (this.sending) return;

      runWithSendingAndProgress({
        setSending: (value) => {
          this.sending = value;
        },
        task: () => tagApi.categoryTag.exportCsv({}),
      })
        .then((res) => {
          const csvContent = buildTagCsvText(res.data);
          downloadCsvFile({ filename: 'categorytag.csv', content: csvContent });
        })
        .catch((error) => {
          this.$refs.listBase.showError(this.$t('CSVファイルのエクスポートに失敗しました'), error);
        });
    },
  },
};
</script>

<style scoped>
.category-tag-management__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.category-tag-management__create-button {
  flex: 0 0 auto;
  margin: 0;
  margin-inline-start: auto;
}

.category-tag-management__csv-tools {
  margin-block: 12px 4px;
  padding: 16px;
  border: 1px solid #d7d7d7;
  border-radius: 4px;
}

.category-tag-management__csv-title {
  margin: 0 0 12px;
  font-size: 16px;
}

.category-tag-management__csv-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-tag-management__csv-actions :deep(.ui-button) {
  margin: 0;
}

.category-tag-target-context {
  margin-bottom: 16px;
}

.category-tag-import-contexts {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

@media screen and (max-width: 896px) {
  .category-tag-management__header {
    flex-wrap: wrap;
  }

  .category-tag-management__csv-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .category-tag-management__csv-actions :deep(.ui-button) {
    width: 100%;
    min-height: 44px;
  }
}
</style>
