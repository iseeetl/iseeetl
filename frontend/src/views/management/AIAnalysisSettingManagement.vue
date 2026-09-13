<template>
  <ManagementListBase
    class="ai-analysis-settings"
    ref="listBase"
    :title="$t('aiAnalysisSettings.titleCommonManagement')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('aiAnalysisSettings.titleCommon') })"
    :fetcher="fetchSettings"
    :payload-builder="buildListPayload"
    :search-enabled="true"
    :search-label="$t('aiAnalysisSettings.search')"
    :search-max-length="100"
    :search-max-error-text="$t('aiAnalysisSettings.validationSearchLength', { max: 100 })"
    :error-message="$t('aiAnalysisSettings.loadFailed')"
  >
    <template #header="{ fetching }">
      <div class="ai-analysis-settings__header">
        <h1 class="view-title" tabindex="-1">{{ $t('aiAnalysisSettings.titleCommonManagement') }}</h1>
        <UiButton
          class="ai-analysis-settings__create-button"
          appearance="filled"
          tone="primary"
          data-testid="ai-analysis-setting-create"
          :aria-label="$t('aiAnalysisSettings.create')"
          :aria-describedby="
            categoryTagsError ? 'ai-analysis-settings-category-tags-error' : undefined
          "
          :disabled="sending || fetching || categoryTagsLoading"
          @click="openCreateDialog"
        >
          {{ $t('作成') }}
        </UiButton>
      </div>
    </template>

    <template #actions>
      <p
        v-if="categoryTagsError"
        id="ai-analysis-settings-category-tags-error"
        class="ai-analysis-settings__error"
        role="alert"
      >
        {{ categoryTagsError }}
      </p>
    </template>

    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--wide ai-analysis-settings__table">
          <colgroup>
            <col class="ai-analysis-settings__column--tag" />
            <col class="ai-analysis-settings__column--kind" />
            <col class="ai-analysis-settings__column--prompt" />
            <col class="ai-analysis-settings__column--result-user" />
            <col class="ai-analysis-settings__column--actions" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ $t('aiAnalysisSettings.tag') }}</th>
              <th scope="col">{{ $t('aiAnalysisSettings.kind') }}</th>
              <th scope="col">{{ $t('aiAnalysisSettings.prompt') }}</th>
              <th scope="col">{{ $t('aiAnalysisSettings.managementResultUser') }}</th>
              <th scope="col">{{ $t('aiAnalysisSettings.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="setting in items" :key="setting._id">
              <td :data-label="$t('aiAnalysisSettings.tag')" dir="auto">
                {{ setting.tag?.name || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('aiAnalysisSettings.kind')">{{ kindLabel(setting.analysis_kind) }}</td>
              <td :data-label="$t('aiAnalysisSettings.prompt')" class="ai-analysis-settings__prompt" dir="auto">
                {{ setting.additional_prompt || '—' }}
              </td>
              <td :data-label="$t('aiAnalysisSettings.managementResultUser')" dir="auto">
                {{ resolveUserDisplayName(setting.result_user) || $t('managementUi.referenceUnavailable') }}
              </td>
              <td :data-label="$t('aiAnalysisSettings.actions')" class="ai-analysis-settings__action-cell">
                <div class="management-row-actions-group ai-analysis-settings__row-actions">
                  <div class="management-row-actions ai-analysis-settings__row-buttons">
                    <UiButton
                      class="management-row-action-button"
                      :data-management-lifecycle-id="setting._id"
                      appearance="filled"
                      tone="danger"
                      density="dense"
                      :aria-label="
                        $t('aiAnalysisSettings.deleteSettingAria', {
                          tag: settingResourceName(setting),
                        })
                      "
                      :disabled="sending"
                      @click="showLifecycleDialog(setting)"
                    >
                      {{ $t('aiAnalysisSettings.delete') }}
                    </UiButton>
                    <UiButton
                      class="management-row-action-button"
                      appearance="filled"
                      tone="primary"
                      density="dense"
                      :aria-label="
                        $t('aiAnalysisSettings.editSettingAria', {
                          tag: settingResourceName(setting),
                        })
                      "
                      :disabled="sending || settingReferenceUnavailable(setting)"
                      :aria-describedby="
                        settingReferenceUnavailable(setting) ? unavailableReasonId(setting) : undefined
                      "
                      @click="openEditDialog(setting)"
                    >
                      {{ $t('aiAnalysisSettings.edit') }}
                    </UiButton>
                  </div>
                  <p
                    v-if="settingReferenceUnavailable(setting)"
                    :id="unavailableReasonId(setting)"
                    class="management-action-reason"
                  >
                    {{ $t('managementUi.referenceUnavailable') }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #dialogs>
      <BaseEditDialog
        class="ai-analysis-setting-form-dialog"
        :visible="dialogVisible"
        :sending="sending"
        title-id="ai-analysis-setting-dialog-title"
        :title-text="formDialogTitle"
        :description-ids="formDialogDescriptionIds"
        :cancel-label="$t('キャンセル')"
        :confirm-label="formActionLabel"
        confirm-test-id="ai-analysis-setting-submit"
        :confirm-disabled="resultUsersLoading"
        actions-adjacent
        initial-focus="#ai-analysis-setting-tag"
        progress-mode="indeterminate"
        @update:visible="dialogVisible = $event"
        @cancel="requestCloseDialog"
        @closed="handleFormDialogClosed"
        @confirm="submitSetting"
      >
        <DialogTargetContext
          v-if="dialogTargetName"
          :context-id="formTargetContextId"
          :label="$t('対象設定')"
          :name="dialogTargetName"
        />

        <AIAnalysisSettingFormFields
          ref="formFields"
          id-prefix="ai-analysis-setting"
          form-title-id="ai-analysis-setting-dialog-title"
          :tag-value="form.tagId"
          :kind-value="form.analysisKind"
          :prompt-value="form.additionalPrompt"
          :result-user-value="form.resultUserId"
          :search-value="resultUserSearch"
          :tags="categoryTags"
          :analysis-kinds="analysisKinds"
          :kind-label="kindLabel"
          :tag-error="formSubmitted && !form.tagId ? $t('aiAnalysisSettings.validationRequired') : ''"
          :kind-error="formSubmitted && !kindValid ? $t('aiAnalysisSettings.validationInvalidKind') : ''"
          :prompt-description="promptDescription"
          :prompt-error="formSubmitted ? promptError : ''"
          :result-user-error="formSubmitted && !form.resultUserId ? $t('aiAnalysisSettings.managementSelectResultUser') : ''"
          :result-users="resultUsers"
          :selected-result-user="selectedResultUser"
          :search-completed="resultUserSearchCompleted"
          :searching="resultUsersLoading"
          :sending="sending"
          :search-error="resultUsersError"
          :loading-text="$t('aiAnalysisSettings.loading')"
          @update:tag-value="form.tagId = $event"
          @update:kind-value="form.analysisKind = $event"
          @update:prompt-value="form.additionalPrompt = $event"
          @update:result-user-value="form.resultUserId = $event"
          @update:search-value="resultUserSearch = $event"
          @search="searchResultUsers"
        />
      </BaseEditDialog>

      <ConfirmDialog
        :dialog-visible="discardConfirmVisible"
        :title="$t('破棄')"
        :message="$t('変更内容を破棄しますか？')"
        :confirm-label="$t('破棄')"
        :cancel-label="$t('キャンセル')"
        :actions-adjacent="true"
        :close-on-escape="true"
        :close-on-backdrop="true"
        confirm-icon="delete"
        @confirm="confirmDiscard"
        @cancel="cancelDiscard"
        @closed="handleDiscardConfirmationClosed"
      />

      <ManagementLifecycleDialog
        v-if="lifecycleTarget"
        :open="lifecycleDialogVisible"
        :sending="sending"
        action="delete"
        :show-delete-recovery-note="false"
        :warning="$t('この操作は元に戻せません')"
        :resource-label="$t('aiAnalysisSettings.titleCommon')"
        :resource-name="settingResourceName(lifecycleTarget)"
        @confirm="deleteSetting"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      />
    </template>
  </ManagementListBase>
</template>

<script>
import aiAnalysisSettingsApi from '@/api/aiAnalysisSettings';
import AIAnalysisSettingFormFields from '@/components/analysis/AIAnalysisSettingFormFields.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import {
  ANALYSIS_KINDS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_SPEECH_PROMPT_BYTES,
  buildSettingPayload,
  isRevisionConflict,
  validateAdditionalPrompt,
  validateAnalysisKind,
} from '@/features/analysis/settings';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import UiButton from '@/components/ui/UiButton.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

const emptyForm = () => ({
  _id: null,
  tagId: '',
  analysisKind: '',
  additionalPrompt: '',
  resultUserId: '',
  revision: null,
});

const KIND_KEYS = Object.freeze({
  vision: 'aiAnalysisSettings.kindVision',
  audioScene: 'aiAnalysisSettings.kindAudioScene',
  speech: 'aiAnalysisSettings.kindSpeech',
  video: 'aiAnalysisSettings.kindVideo',
  conversation: 'aiAnalysisSettings.kindConversation',
});

export default {
  name: 'AIAnalysisSettingManagement',
  components: {
    AIAnalysisSettingFormFields,
    BaseEditDialog,
    ConfirmDialog,
    DialogTargetContext,
    ManagementLifecycleDialog,
    ManagementListBase,
    UiButton,
  },
  data() {
    return {
      analysisKinds: ANALYSIS_KINDS,
      categoryTags: [],
      categoryTagsLoading: false,
      categoryTagsError: '',
      dialogVisible: false,
      form: emptyForm(),
      initialFormSnapshot: null,
      dialogTargetName: '',
      discardConfirmVisible: false,
      discardClosePending: false,
      formSubmitted: false,
      resultUserSearch: '',
      resultUserSearchCompleted: false,
      resultUsers: [],
      resultUsersLoading: false,
      resultUsersError: '',
      resultUserRequestId: 0,
      sending: false,
      lifecycleDialogVisible: false,
      lifecycleTarget: null,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
    };
  },
  computed: {
    formActionLabel() {
      return this.form._id ? this.$t('aiAnalysisSettings.save') : this.$t('作成');
    },
    formDialogTitle() {
      return this.$t(
        this.form._id ? 'aiAnalysisSettings.editTitle' : 'aiAnalysisSettings.createTitle'
      );
    },
    kindValid() {
      return validateAnalysisKind(this.form.analysisKind);
    },
    promptValidation() {
      return validateAdditionalPrompt(this.form.additionalPrompt, this.form.analysisKind);
    },
    promptDescription() {
      if (this.form.analysisKind === 'speech') {
        return this.$t('aiAnalysisSettings.promptSpeechDescription', {
          max: MAX_SPEECH_PROMPT_BYTES,
        });
      }
      return this.$t('aiAnalysisSettings.promptDescription', {
        codePoints: MAX_ADDITIONAL_PROMPT_CODE_POINTS,
      });
    },
    promptDescriptionId() {
      return 'ai-analysis-setting-prompt-description';
    },
    promptError() {
      const error = this.promptValidation.error;
      if (error === 'invalidType') return this.$t('aiAnalysisSettings.validationRequired');
      if (error === 'tooManyCodePoints') {
        return this.$t('aiAnalysisSettings.validationPromptCodePoints', {
          max: MAX_ADDITIONAL_PROMPT_CODE_POINTS,
        });
      }
      if (error === 'tooManyBytes') {
        return this.$t('aiAnalysisSettings.validationPromptBytes', {
          max: MAX_ADDITIONAL_PROMPT_BYTES,
        });
      }
      if (error === 'speechTooManyBytes') {
        return this.$t('aiAnalysisSettings.validationSpeechPromptBytes', {
          max: MAX_SPEECH_PROMPT_BYTES,
        });
      }
      return '';
    },
    selectedResultUser() {
      return this.resultUsers.find((user) => user._id === this.form.resultUserId) || null;
    },
    formTargetContextId() {
      return 'ai-analysis-setting-target-context';
    },
    formDialogDescriptionIds() {
      return [this.dialogTargetName ? this.formTargetContextId : '', this.promptDescriptionId]
        .filter(Boolean)
        .join(' ');
    },
    hasUnsavedChanges() {
      return (
        this.initialFormSnapshot !== null &&
        this.initialFormSnapshot !== this.createFormSnapshot()
      );
    },
  },
  created() {
    this.loadCategoryTags();
  },
  beforeUnmount() {
    this.resultUserRequestId += 1;
  },
  methods: {
    ...userDisplayMethods,
    buildListPayload({ page, search }) {
      return { page, search: search ?? '' };
    },
    fetchSettings(payload) {
      return aiAnalysisSettingsApi.common.paginate(payload);
    },
    reloadSettings() {
      return this.$refs.listBase?.reload();
    },
    async loadCategoryTags() {
      this.categoryTagsLoading = true;
      this.categoryTagsError = '';
      try {
        const response = await aiAnalysisSettingsApi.categoryTags.list({});
        this.categoryTags = Array.isArray(response?.data) ? response.data : [];
      } catch (error) {
        this.categoryTagsError = this.$t('aiAnalysisSettings.loadTagsFailed');
      } finally {
        this.categoryTagsLoading = false;
      }
    },
    kindLabel(kind) {
      return this.$t(KIND_KEYS[kind] || 'aiAnalysisSettings.validationInvalidKind');
    },
    async openCreateDialog() {
      if (this.sending || this.categoryTagsLoading) return;
      this.form = emptyForm();
      this.initialFormSnapshot = this.createFormSnapshot();
      this.dialogTargetName = '';
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.formSubmitted = false;
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.resultUsers = [];
      this.resultUsersError = '';
      this.dialogVisible = true;
      const initialForm = { ...this.form };
      const requestId = ++this.resultUserRequestId;
      this.resultUsersLoading = true;
      try {
        const { data: user } = await aiAnalysisSettingsApi.common.defaultResultUser();
        if (requestId !== this.resultUserRequestId || !this.dialogVisible) return;
        if (!user?._id || this.form.resultUserId) return;
        this.resultUsers = [user];
        this.form.resultUserId = user._id;
        this.initialFormSnapshot = this.createFormSnapshot({ ...initialForm, resultUserId: user._id });
      } catch (error) {
        if (requestId === this.resultUserRequestId && this.dialogVisible) {
          this.resultUsersError = this.$t('aiAnalysisSettings.managementResultUserSearchFailed');
        }
      } finally {
        if (requestId === this.resultUserRequestId) this.resultUsersLoading = false;
      }
    },
    openEditDialog(setting) {
      if (!setting || this.sending || this.settingReferenceUnavailable(setting)) return;
      this.resultUserRequestId += 1;
      this.resultUsersLoading = false;
      this.form = {
        _id: setting._id,
        tagId: setting.tag?._id || '',
        analysisKind: setting.analysis_kind || '',
        additionalPrompt: setting.additional_prompt || '',
        resultUserId: setting.result_user?._id || '',
        revision: setting.revision,
      };
      this.initialFormSnapshot = this.createFormSnapshot();
      this.dialogTargetName = this.settingResourceName(setting);
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.formSubmitted = false;
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.resultUsers = setting.result_user?._id ? [setting.result_user] : [];
      this.resultUsersError = '';
      this.dialogVisible = true;
    },
    settingResourceName(setting) {
      const tagName = setting?.tag?.name || setting?._id || '';
      return `${this.kindLabel(setting?.analysis_kind)} / ${tagName}`;
    },
    settingReferenceUnavailable(setting) {
      return (
        !setting?.tag?._id ||
        setting.tag.delete_flg === true ||
        !setting?.result_user?._id ||
        setting.result_user.delete_flg === true
      );
    },
    unavailableReasonId(setting) {
      return `ai-analysis-setting-unavailable-${setting?._id || 'unknown'}`;
    },
    showLifecycleDialog(setting) {
      if (!setting || this.sending) return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(setting._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = setting;
      this.lifecycleDialogVisible = true;
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
    createFormSnapshot(form = this.form) {
      return JSON.stringify({
        tagId: form.tagId,
        analysisKind: form.analysisKind,
        additionalPrompt: form.additionalPrompt,
        resultUserId: form.resultUserId,
      });
    },
    requestCloseDialog() {
      if (this.sending) return;
      if (this.hasUnsavedChanges) {
        this.discardConfirmVisible = true;
        return;
      }
      this.closeDialog();
    },
    confirmDiscard() {
      this.discardClosePending = true;
      this.discardConfirmVisible = false;
    },
    cancelDiscard() {
      this.discardClosePending = false;
      this.discardConfirmVisible = false;
    },
    handleDiscardConfirmationClosed() {
      if (!this.discardClosePending) return;
      this.discardClosePending = false;
      this.closeDialog();
    },
    closeDialog() {
      if (this.sending) return;
      this.resultUserRequestId += 1;
      this.dialogVisible = false;
    },
    handleFormDialogClosed() {
      this.form = emptyForm();
      this.initialFormSnapshot = null;
      this.dialogTargetName = '';
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.formSubmitted = false;
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.resultUsers = [];
      this.resultUsersError = '';
      this.resultUsersLoading = false;
    },
    async searchResultUsers() {
      if (this.resultUsersLoading) return;
      this.resultUserSearchCompleted = false;
      const search = this.resultUserSearch.trim();
      if ([...search].length > 100) {
        this.resultUsersError = this.$t('aiAnalysisSettings.validationSearchLength', { max: 100 });
        return;
      }
      const requestId = ++this.resultUserRequestId;
      const selected = this.resultUsers.find((user) => user._id === this.form.resultUserId);
      this.resultUsersLoading = true;
      this.resultUsersError = '';
      try {
        const response = await aiAnalysisSettingsApi.resultUsers.search({
          search,
        });
        if (requestId !== this.resultUserRequestId) return;
        const users = Array.isArray(response?.data)
          ? response.data.map(({ _id, username, image_name }) => ({
              _id,
              username,
              image_name: image_name ?? null,
            }))
          : [];
        if (selected && !users.some((user) => user._id === selected._id)) users.unshift(selected);
        this.resultUsers = users;
        this.resultUserSearchCompleted = true;
      } catch (error) {
        if (requestId === this.resultUserRequestId) {
          this.resultUsersError = this.$t('aiAnalysisSettings.managementResultUserSearchFailed');
        }
      } finally {
        if (requestId === this.resultUserRequestId) this.resultUsersLoading = false;
      }
    },
    async handleConflict() {
      this.sending = false;
      this.closeDialog();
      this.clearLifecycleDialog();
      await this.reloadSettings();
      this.$refs.listBase?.showSnackbar(this.$t('aiAnalysisSettings.conflictReloaded'));
    },
    async submitSetting() {
      if (this.sending || this.resultUsersLoading) return;
      this.formSubmitted = true;
      if (!this.form.tagId || !this.kindValid || !this.promptValidation.valid || !this.form.resultUserId) {
        this.focusFirstFormError();
        return;
      }

      this.sending = true;
      const normalizedForm = {
        ...this.form,
        additionalPrompt: this.promptValidation.value,
      };
      const payload = buildSettingPayload({ scope: 'common', form: normalizedForm });
      try {
        await (this.form._id
          ? aiAnalysisSettingsApi.common.update(payload)
          : aiAnalysisSettingsApi.common.create(payload));
        await this.reloadSettings();
        this.$refs.listBase?.showSnackbar(this.$t('aiAnalysisSettings.saved'));
        this.sending = false;
        this.closeDialog();
      } catch (error) {
        if (this.form._id && (isRevisionConflict(error) || error?.response?.status === 404)) {
          await this.handleConflict();
          return;
        }
        this.$refs.listBase?.showError(this.$t('aiAnalysisSettings.saveFailed'), error);
        this.sending = false;
      }
    },
    focusFirstFormError() {
      this.$nextTick(() => {
        if (!this.form.tagId) return this.$refs.formFields?.focusTag();
        if (!this.kindValid) return this.$refs.formFields?.focusKind();
        if (!this.promptValidation.valid) return this.$refs.formFields?.focusPrompt();
        if (!this.form.resultUserId) return this.$refs.formFields?.focusResultUserSearch();
      });
    },
    async deleteSetting() {
      if (!this.lifecycleTarget || this.sending) return;
      this.sending = true;
      try {
        await aiAnalysisSettingsApi.common.remove({
          _id: this.lifecycleTarget._id,
          revision: this.lifecycleTarget.revision,
        });
        await this.reloadSettings();
        this.$refs.listBase?.showSnackbar(
          this.$t('aiAnalysisSettings.deleted')
        );
        this.sending = false;
        this.lifecycleFocusAfterMutation = true;
        this.clearLifecycleDialog();
      } catch (error) {
        if (isRevisionConflict(error) || error?.response?.status === 404) {
          await this.handleConflict();
          return;
        }
        this.$refs.listBase?.showError(
          this.$t('aiAnalysisSettings.deleteFailed'),
          error
        );
        this.sending = false;
      }
    },
  },
};
</script>

<style scoped>
:global(.ai-analysis-setting-form-dialog) {
  --ui-dialog-width: 920px;
}

.ai-analysis-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.ai-analysis-settings__create-button {
  flex: 0 0 auto;
  margin: 0;
  margin-inline-start: auto;
}

.ai-analysis-settings__table {
  table-layout: auto;
}

.ai-analysis-settings__table th {
  background: #f7f7f7;
  white-space: normal;
  overflow-wrap: normal;
  word-break: keep-all;
}

.ai-analysis-settings__table td {
  vertical-align: middle;
}

.ai-analysis-settings__column--tag {
  width: 22%;
}

.ai-analysis-settings__column--kind {
  width: 14%;
}

.ai-analysis-settings__column--prompt {
  width: 22%;
}

.ai-analysis-settings__column--result-user {
  width: 22%;
}

.ai-analysis-settings__column--actions {
  width: 20%;
}

.ai-analysis-settings__action-cell {
  white-space: nowrap;
  overflow-wrap: normal;
}

.ai-analysis-settings__row-actions {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: flex-end;
}

.ai-analysis-settings__row-buttons {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
}

.ai-analysis-settings__row-buttons :deep(.ui-button) {
  margin: 0;
}

.ai-analysis-settings__row-actions .management-action-reason {
  flex-basis: auto;
  max-width: 100%;
  white-space: normal;
}

.ai-analysis-settings__prompt {
  white-space: pre-wrap;
}

.ai-analysis-settings__error {
  color: var(--ui-color-danger);
}

@media (max-width: 480px) {
  .ai-analysis-settings :deep(.view-header) {
    box-sizing: border-box;
    height: auto;
    min-height: 48px;
    padding-block: 6px;
  }

  .ai-analysis-settings__header {
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media screen and (max-width: 1100px) {
  .ai-analysis-settings__row-actions {
    align-items: flex-start;
    justify-content: flex-start;
  }

  .ai-analysis-settings__action-cell {
    white-space: normal;
  }
}
</style>
