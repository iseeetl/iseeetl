<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('スパム管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('スパムワード') })"
    :fetcher="fetchSpam"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('スパムワード') })"
    :searchEnabled="true"
    :searchMinLength="1"
    :searchMaxLength="50"
    :searchMinErrorText="$t('1文字以上です')"
    :searchMaxErrorText="$t('50文字まで')"
    :payloadBuilder="buildSearchPayload"
  >
    <template #header>
      <div class="management-page-header">
        <h1 class="view-title" tabindex="-1">{{ $t('スパム管理') }}</h1>
        <UiButton
          class="create-button"
          data-testid="management-spam-create"
          appearance="filled"
          tone="primary"
          :disabled="sending"
          @click="showEditSpamDialog()"
        >
          {{ $t('作成') }}
        </UiButton>
      </div>
    </template>

    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--compact">
          <thead>
            <tr>
              <th scope="col">{{ $t('スパムワード') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="spam in items" :key="spam._id">
              <td :data-label="$t('スパムワード')">{{ spam.word }}</td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(spam.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('操作')">
                <div class="management-row-actions">
                  <UiButton
                    data-testid="management-spam-delete"
                    :data-management-lifecycle-id="spam._id"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="danger"
                    :disabled="sending"
                    :aria-label="$t('managementUi.deleteResourceAria', { resource: $t('スパムワード'), name: spam.word })"
                    @click="showDeleteSpamDialog(spam)"
                  >{{ $t('managementUi.delete') }}</UiButton>
                  <UiButton
                    class="management-row-action-button"
                    appearance="filled"
                    tone="primary"
                    :disabled="sending"
                    :aria-label="$t('{resource}「{name}」を編集', { resource: $t('スパムワード'), name: spam.word })"
                    @click="showEditSpamDialog(spam)"
                  >{{ $t('managementUi.edit') }}</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <BaseEditDialog
        class="spam-management-form-dialog"
        :visible="editSpamValue.dialogVisible"
        :sending="sending"
        title-id="spam-management-edit-dialog-title"
        :title-text="spamDialogTitle"
        :description-ids="spamEditing ? 'spam-management-target-context' : ''"
        :cancel-label="$t('キャンセル')"
        :confirm-label="spamSubmitLabel"
        progress-mode="indeterminate"
        :actions-adjacent="true"
        :confirm-disabled="v$.editSpamValue.$invalid"
        confirm-test-id="management-spam-submit"
        initial-focus="#spam-word"
        @cancel="requestCloseSpamDialog"
        @closed="handleSpamFormDialogClosed"
        @confirm="editSpam"
      >
        <DialogTargetContext
          v-if="spamEditing"
          context-id="spam-management-target-context"
          :label="$t('対象スパムワード')"
          :name="selectedSpamWord"
        />

        <UiField
          v-slot="{ controlAttrs }"
          control-id="spam-word"
          :label="$t('スパムワード')"
          :invalid="v$.editSpamValue.word.$dirty && v$.editSpamValue.word.$invalid"
          :error="wordError"
        >
          <input
            v-bind="controlAttrs"
            v-model="editSpamValue.word"
            maxlength="50"
            :disabled="sending"
            @blur="v$.editSpamValue.word.$touch()"
          />
        </UiField>
      </BaseEditDialog>

      <ConfirmDialog
        class="spam-management-delete-dialog"
        :dialog-visible="deleteSpamValue.dialogVisible"
        :title="$t('スパムワード削除')"
        title-id="spam-management-delete-dialog-title"
        :confirm-label="$t('managementUi.delete')"
        :cancel-label="$t('キャンセル')"
        :sending="sending"
        :actions-adjacent="true"
        :close-on-confirm="false"
        :close-on-escape="true"
        :close-on-backdrop="true"
        initial-focus="[data-testid='confirm-dialog-cancel']"
        confirm-icon="delete"
        confirm-tone="danger"
        progress-mode="indeterminate"
        confirm-test-id="management-spam-delete-confirm"
        @confirm="deleteSpam"
        @cancel="requestCloseDeleteSpamDialog"
        @closed="handleSpamDeleteDialogClosed"
      >
        <DialogTargetContext
          context-id="spam-management-delete-target-context"
          :label="$t('対象スパムワード')"
          :name="selectedSpamWord"
        />
        <p id="spam-management-delete-description">{{ $t('この操作は元に戻せません') }}</p>
      </ConfirmDialog>

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
    </template>
  </ManagementListBase>
</template>

<script>
import spamApi from '@/api/spam';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength } from '@vuelidate/validators';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';

export default {
  name: 'SpamManagement',
  components: {
    ManagementListBase,
    BaseEditDialog,
    ConfirmDialog,
    DialogTargetContext,
    UiButton,
    UiField,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      dateTimeZone: 'Asia/Tokyo',

      editSpamValue: {
        dialogVisible: false,
        _id: null,
        word: null,
      },
      deleteSpamValue: {
        dialogVisible: false,
      },

      sending: false,
      selectedSpamWord: '',
      initialSpamWord: '',
      discardConfirmVisible: false,
      discardClosePending: false,
      deleteOpenPending: false,
      deleteFocusRequest: null,
      deleteFocusAfterMutation: false,
    };
  },
  validations: {
    editSpamValue: {
      word: {
        required,
        minLength: minLength(1),
        maxLength: maxLength(50),
      },
    },
  },
  computed: {
    spamEditing() {
      return this.editSpamValue._id !== null;
    },
    spamDialogTitle() {
      return this.$t(this.spamEditing ? 'スパムワード編集' : 'スパムワード作成');
    },
    spamSubmitLabel() {
      return this.$t(this.spamEditing ? 'managementUi.save' : '作成');
    },
    spamFormDirty() {
      return (this.editSpamValue.word || '') !== this.initialSpamWord;
    },
    wordError() {
      const field = this.v$.editSpamValue.word;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('必須です');
      if (field.minLength.$invalid) return this.$t('1文字以上です');
      if (field.maxLength.$invalid) return this.$t('50文字まで');
      return '';
    },
  },
  methods: {
    ...createManagementDateFormatterMethods(),
    buildSearchPayload({ page, search }) {
      const hasSearch = typeof search === 'string' && search.trim().length > 0;
      return { page, search: hasSearch ? search.trim() : null };
    },
    fetchSpam(payload) {
      return spamApi.paginate(payload);
    },

    showEditSpamDialog(spam = null) {
      this.v$.$reset();
      this.editSpamValue._id = spam?._id ?? null;
      this.editSpamValue.word = spam?.word ?? null;
      this.selectedSpamWord = spam?.word ?? '';
      this.editSpamValue.dialogVisible = true;
      this.initialSpamWord = this.editSpamValue.word || '';
    },

    async editSpam() {
      this.v$.editSpamValue.$touch();
      if (this.v$.editSpamValue.$invalid) return;

      if (this.sending) return;
      this.sending = true;

      const body = this.editSpamValue._id
        ? { _id: this.editSpamValue._id, word: this.editSpamValue.word.trim() }
        : { word: this.editSpamValue.word.trim() };
      const isCreating = this.editSpamValue._id === null;

      try {
        await (this.editSpamValue._id ? spamApi.update(body) : spamApi.create(body));
      } catch (e) {
        this.sending = false;
        this.$refs.listBase.showError(
          this.$t(isCreating ? '作成に失敗しました' : '更新に失敗しました'),
          e,
        );
        return;
      }

      try {
        await this.$refs.listBase.reload();
      } catch {
        // 一覧の再取得で発生したエラーの表示は、ManagementListBaseに任せる。
      }
      this.sending = false;
      this.closeSpamFormDialog();
    },

    showDeleteSpamDialog(spam = null) {
      if (this.sending || (!spam && !this.editSpamValue._id)) return;
      if (spam) {
        this.editSpamValue._id = spam._id;
        this.editSpamValue.word = spam.word;
        this.selectedSpamWord = spam.word;
      }
      this.deleteFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(this.editSpamValue._id) || {
          candidateIds: [],
        };
      this.deleteFocusAfterMutation = false;
      if (this.editSpamValue.dialogVisible) {
        this.deleteOpenPending = true;
        this.editSpamValue.dialogVisible = false;
        return;
      }
      this.deleteSpamValue.dialogVisible = true;
    },

    async deleteSpam() {
      if (this.sending) return;
      this.sending = true;

      try {
        await spamApi.remove({ _id: this.editSpamValue._id });
      } catch (e) {
        this.sending = false;
        this.$refs.listBase.showError(this.$t('削除に失敗しました'), e);
        return;
      }

      try {
        await this.$refs.listBase.reload();
      } catch {
        // 一覧の再取得で発生したエラーの表示は、ManagementListBaseに任せる。
      }
      this.sending = false;
      this.deleteFocusAfterMutation = true;
      this.closeSpamDeleteDialog();
    },

    requestCloseSpamDialog() {
      if (this.sending) return;
      if (this.spamFormDirty) {
        this.discardClosePending = false;
        this.discardConfirmVisible = true;
        return;
      }
      this.closeSpamFormDialog();
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
      this.closeSpamFormDialog();
    },
    closeSpamFormDialog() {
      if (this.sending) return;
      this.editSpamValue.dialogVisible = false;
    },
    requestCloseDeleteSpamDialog() {
      if (this.sending) return;
      this.closeSpamDeleteDialog();
    },
    closeSpamDeleteDialog() {
      if (this.sending) return;
      this.deleteSpamValue.dialogVisible = false;
    },
    handleSpamFormDialogClosed() {
      if (this.deleteOpenPending) {
        this.deleteOpenPending = false;
        this.deleteSpamValue.dialogVisible = true;
        return;
      }
      this.clearEditSpamValue();
    },
    handleSpamDeleteDialogClosed() {
      const focusRequest = this.deleteFocusAfterMutation ? this.deleteFocusRequest : null;
      this.clearEditSpamValue();
      if (focusRequest) this.$refs.listBase?.restoreLifecycleFocus?.(focusRequest);
    },

    clearEditSpamValue() {
      if (this.sending) return;
      this.v$.$reset();
      this.editSpamValue.dialogVisible = false;
      this.deleteSpamValue.dialogVisible = false;
      this.editSpamValue._id = null;
      this.editSpamValue.word = null;
      this.selectedSpamWord = '';
      this.initialSpamWord = '';
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.deleteOpenPending = false;
      this.deleteFocusRequest = null;
      this.deleteFocusAfterMutation = false;
    },
  },
};
</script>

<style scoped>
:global(.spam-management-form-dialog),
:global(.spam-management-delete-dialog) {
  --ui-dialog-width: 600px;
}
</style>
