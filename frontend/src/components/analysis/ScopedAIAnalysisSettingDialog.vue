<template>
  <UiDialog
    class="scoped-ai-analysis-settings-dialog"
    :open="visible"
    :title-id="titleId"
    :description-ids="descriptionIds"
    :initial-focus="initialFocusSelector"
    :close-on-escape="!closeBlocked"
    :close-on-backdrop="!closeBlocked"
    :data-testid="`scoped-ai-analysis-settings-${scope}`"
    @request-close="requestClose"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        :id="formVisible ? `${idPrefix}-back-mobile` : closeButtonId"
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="formVisible ? $t('戻る') : $t('aiAnalysisSettings.close')"
        :disabled="closeBlocked"
        @click.stop="handleHeaderStartAction"
      >
        <UiIcon :name="formVisible ? 'chevron_left' : 'close'" />
      </UiButton>
      <h2 :id="titleId" class="ui-dialog__heading" tabindex="-1">
        {{ currentTitle }}
      </h2>
      <UiButton
        :id="formVisible ? `${idPrefix}-save-mobile` : `${idPrefix}-create-mobile`"
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="formVisible ? formActionLabel : $t('aiAnalysisSettings.create')"
        :disabled="busy || (formVisible && searching)"
        @click.stop="handleHeaderEndAction"
      >
        <UiIcon :name="formVisible ? 'done' : 'add'" />
      </UiButton>
    </template>

    <p :id="descriptionId" class="screen-reader-only">
      {{ currentTitle }}
    </p>

    <DialogTargetContext
      v-if="targetName"
      :context-id="targetContextId"
      :label="targetLabel"
      :name="targetName"
    />

    <div v-show="!formVisible" class="settings-view">
      <div v-if="!loading && !loadFailed" class="settings-summary">
        <span>{{ $t('全{total}件', { total: formattedSettingCount }, settings.length) }}</span>
        <UiButton
          :id="`${idPrefix}-create-desktop`"
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy"
          @click="openCreateForm($event)"
        >
          {{ $t('作成') }}
        </UiButton>
      </div>
      <p v-if="loading" role="status">
        {{ $t('aiAnalysisSettings.loading') }}
      </p>
      <div v-else-if="loadFailed" class="settings-load-error" role="alert">
        <p>{{ $t('aiAnalysisSettings.loadFailed') }}</p>
        <UiButton appearance="filled" tone="primary" :disabled="busy" @click="loadDialogData">
          {{ $t('再試行') }}
        </UiButton>
      </div>
      <p v-else-if="settings.length === 0" role="status">
        {{ $t('aiAnalysisSettings.empty') }}
      </p>
      <div v-else class="settings-list">
        <div
          class="settings-table-wrap"
          data-testid="scoped-ai-analysis-settings-desktop-list"
        >
          <table class="settings-table" :aria-label="dialogTitle">
            <thead>
              <tr>
                <th scope="col" class="settings-tag-column">
                  {{ $t('aiAnalysisSettings.tag') }}
                </th>
                <th scope="col" class="settings-kind-column">
                  {{ $t('aiAnalysisSettings.kind') }}
                </th>
                <th scope="col" class="settings-prompt-column">
                  {{ $t('aiAnalysisSettings.prompt') }}
                </th>
                <th scope="col" class="settings-result-user-column">
                  {{ $t('aiAnalysisSettings.managementResultUser') }}
                </th>
                <th scope="col">{{ $t('aiAnalysisSettings.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="setting in settings" :key="setting._id">
                <td dir="auto">{{ getTagName(setting.tag) }}</td>
                <td>{{ kindLabel(setting.analysis_kind) }}</td>
                <td class="settings-prompt-column" dir="auto">
                  {{ setting.additional_prompt || '—' }}
                </td>
                <td dir="auto">{{ resolveUserDisplayName(setting.result_user) }}</td>
                <td>
                  <div class="settings-action-buttons">
                    <UiButton
                      :id="editButtonId(setting, 'desktop')"
                      appearance="filled"
                      tone="primary"
                      :aria-label="$t('aiAnalysisSettings.editSettingAria', { tag: getTagName(setting.tag) })"
                      :disabled="busy"
                      @click="openEditForm(setting, $event)"
                    >
                      {{ $t('aiAnalysisSettings.edit') }}
                    </UiButton>
                    <UiButton
                      :id="deleteButtonId(setting, 'desktop')"
                      appearance="filled"
                      tone="danger"
                      :aria-label="$t('aiAnalysisSettings.deleteSettingAria', { tag: getTagName(setting.tag) })"
                      :disabled="busy"
                      @click="openDeleteConfirmation(setting, $event)"
                    >
                      {{ $t('aiAnalysisSettings.delete') }}
                    </UiButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul
          class="settings-card-list"
          :aria-label="dialogTitle"
          data-testid="scoped-ai-analysis-settings-mobile-list"
        >
          <li
            v-for="setting in settings"
            :key="`card-${setting._id}`"
            class="settings-card"
            :data-testid="`scoped-ai-analysis-settings-card-${setting._id}`"
          >
            <article>
              <header class="settings-card-header">
                <h3 dir="auto">{{ getTagName(setting.tag) }}</h3>
              </header>

              <dl class="settings-card-details">
                <div>
                  <dt>{{ $t('aiAnalysisSettings.kind') }}</dt>
                  <dd>{{ kindLabel(setting.analysis_kind) }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiAnalysisSettings.managementResultUser') }}</dt>
                  <dd dir="auto">{{ resolveUserDisplayName(setting.result_user) }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiAnalysisSettings.prompt') }}</dt>
                  <dd class="settings-card-prompt" dir="auto">
                    {{ setting.additional_prompt || '—' }}
                  </dd>
                </div>
              </dl>

              <div class="settings-card-actions">
                <div class="settings-action-buttons">
                  <UiButton
                    :id="editButtonId(setting, 'mobile')"
                    appearance="filled"
                    tone="primary"
                    :aria-label="$t('aiAnalysisSettings.editSettingAria', { tag: getTagName(setting.tag) })"
                    :disabled="busy"
                    @click="openEditForm(setting, $event)"
                  >
                    {{ $t('aiAnalysisSettings.edit') }}
                  </UiButton>
                  <UiButton
                    :id="deleteButtonId(setting, 'mobile')"
                    appearance="filled"
                    tone="danger"
                    :aria-label="$t('aiAnalysisSettings.deleteSettingAria', { tag: getTagName(setting.tag) })"
                    :disabled="busy"
                    @click="openDeleteConfirmation(setting, $event)"
                  >
                    {{ $t('aiAnalysisSettings.delete') }}
                  </UiButton>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </div>
    </div>

    <AIAnalysisSettingFormFields
      v-if="formVisible"
      ref="formFields"
      :data-testid="`${idPrefix}-form`"
      :id-prefix="idPrefix"
      :form-title-id="titleId"
      :tag-value="form.tagId"
      :kind-value="form.analysisKind"
      :prompt-value="form.additionalPrompt"
      :result-user-value="form.resultUserId"
      :search-value="resultUserSearch"
      :tags="tags"
      :tag-label="getTagName"
      :analysis-kinds="analysisKinds"
      :kind-label="kindLabel"
      :tag-error="tagError"
      :kind-error="kindError"
      :prompt-description="promptDescription"
      :prompt-error="promptError"
      :result-user-error="resultUserError"
      :result-users="resultUsers"
      :selected-result-user="selectedResultUser"
      :search-completed="resultUserSearchCompleted"
      :searching="searching"
      :sending="sending"
      :validation-error="validationError"
      @update:tag-value="form.tagId = $event"
      @update:kind-value="form.analysisKind = $event"
      @update:prompt-value="form.additionalPrompt = $event; validatePrompt()"
      @update:result-user-value="form.resultUserId = $event"
      @update:search-value="resultUserSearch = $event"
      @search="searchResultUsers"
    />

    <template #actions>
      <div v-show="formVisible" class="common-dialog-actions setting-form-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="closeBlocked"
          @click="requestCloseForm"
        >
          {{ $t('戻る') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy || searching"
          @click="saveSetting"
        >
          {{ formActionLabel }}
        </UiButton>
      </div>
      <div v-show="!formVisible" class="common-dialog-actions">
        <UiButton class="desktop-item" appearance="filled" tone="neutral" :disabled="closeBlocked" @click="requestClose">
          {{ $t('aiAnalysisSettings.close') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending || searching"
        mode="indeterminate"
        :aria-labelledby="titleId"
      />
    </template>
  </UiDialog>

  <ManagementLifecycleDialog
    v-if="deleteTarget"
    :open="deleteDialogVisible"
    :sending="sending"
    action="delete"
    :resource-label="dialogTitle"
    :resource-name="settingResourceName(deleteTarget)"
    :show-delete-recovery-note="false"
    :warning="$t('この操作は元に戻せません')"
    :actions-adjacent="true"
    @confirm="confirmDeleteSetting"
    @cancel="closeDeleteConfirmation"
    @request-close="closeDeleteConfirmation"
    @closed="handleDeleteDialogClosed"
  >
    <div class="setting-delete-context">
      <DialogTargetContext
        v-if="targetName"
        :label="targetLabel"
        :name="targetName"
      />
      <DialogTargetContext
        :label="$t('対象設定')"
        :name="settingResourceName(deleteTarget)"
      />
    </div>
  </ManagementLifecycleDialog>

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

<script>
import aiAnalysisSettingsApi from '@/api/aiAnalysisSettings';
import tagApi from '@/api/tag';
import { appendApiErrorMessage } from '@/api/apiClient';
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
import { handleAuthError } from '@/utils/authError';
import { showSnackbar } from '@/utils/snackbar';
import TranslationUtil from '@/utils/translationUtil';
import AIAnalysisSettingFormFields from '@/components/analysis/AIAnalysisSettingFormFields.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

const createEmptyForm = () => ({
  tagId: '',
  analysisKind: '',
  additionalPrompt: '',
  resultUserId: '',
});

export default {
  name: 'ScopedAIAnalysisSettingDialog',
  components: {
    AIAnalysisSettingFormFields,
    ConfirmDialog,
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
    ManagementLifecycleDialog,
  },
  emits: ['close'],
  props: {
    dialogVisible: {
      type: Boolean,
      default: false,
    },
    scope: {
      type: String,
      required: true,
      validator: (value) => ['floor', 'room'].includes(value),
    },
    floorId: {
      type: String,
      default: null,
    },
    roomId: {
      type: String,
      default: null,
    },
    targetName: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      visible: this.dialogVisible,
      loading: false,
      loadFailed: false,
      loadRequestVersion: 0,
      sending: false,
      searching: false,
      searchRequestVersion: 0,
      settings: [],
      tags: [],
      formVisible: false,
      formSubmitted: false,
      formTriggerElement: null,
      formTriggerPresentation: null,
      formFocusRestorePending: false,
      formFocusRequestVersion: 0,
      savedSettingFocusRequest: null,
      editingSetting: null,
      form: createEmptyForm(),
      initialForm: createEmptyForm(),
      validationError: '',
      promptValidation: null,
      resultUserSearch: '',
      resultUserSearchCompleted: false,
      resultUsers: [],
      deleteDialogVisible: false,
      deleteTarget: null,
      deleteFocusRequest: null,
      deleteClosedFocusRequest: null,
      discardConfirmVisible: false,
      discardClosePending: false,
      discardFocusPending: false,
    };
  },
  computed: {
    busy() {
      return this.loading || this.sending || this.searching;
    },
    closeBlocked() {
      return this.sending;
    },
    analysisKinds() {
      return ANALYSIS_KINDS;
    },
    api() {
      return aiAnalysisSettingsApi[this.scope];
    },
    dialogTitle() {
      return this.scope === 'floor'
        ? this.$t('aiAnalysisSettings.titleFloor')
        : this.$t('aiAnalysisSettings.titleRoom');
    },
    targetLabel() {
      return this.scope === 'floor' ? this.$t('対象フロア') : this.$t('対象ルーム');
    },
    currentTitle() {
      if (!this.formVisible) return this.dialogTitle;
      return this.editingSetting
        ? this.$t('aiAnalysisSettings.editTitle')
        : this.$t('aiAnalysisSettings.createTitle');
    },
    idPrefix() {
      return `scoped-ai-analysis-settings-${this.scope}`;
    },
    titleId() {
      return `${this.idPrefix}-title`;
    },
    descriptionId() {
      return `${this.idPrefix}-description`;
    },
    targetContextId() {
      return `${this.idPrefix}-target-context`;
    },
    descriptionIds() {
      return [this.descriptionId, this.targetName ? this.targetContextId : ''].filter(Boolean).join(' ');
    },
    closeButtonId() {
      return `${this.idPrefix}-close`;
    },
    initialFocusSelector() {
      return `#${this.titleId}`;
    },
    formattedSettingCount() {
      return typeof this.$n === 'function' ? this.$n(this.settings.length) : String(this.settings.length);
    },
    formActionLabel() {
      return this.editingSetting ? this.$t('aiAnalysisSettings.save') : this.$t('作成');
    },
    formDirty() {
      return JSON.stringify(this.form) !== JSON.stringify(this.initialForm);
    },
    promptError() {
      if (!this.promptValidation || this.promptValidation.valid) return '';
      const keyByError = {
        invalidType: 'aiAnalysisSettings.validationRequired',
        tooManyCodePoints: 'aiAnalysisSettings.validationPromptCodePoints',
        tooManyBytes: 'aiAnalysisSettings.validationPromptBytes',
        speechTooManyBytes: 'aiAnalysisSettings.validationSpeechPromptBytes',
      };
      const maximumByError = {
        tooManyCodePoints: MAX_ADDITIONAL_PROMPT_CODE_POINTS,
        tooManyBytes: MAX_ADDITIONAL_PROMPT_BYTES,
        speechTooManyBytes: MAX_SPEECH_PROMPT_BYTES,
      };
      return this.$t(keyByError[this.promptValidation.error], {
        max: maximumByError[this.promptValidation.error],
      });
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
    tagError() {
      if (!this.formSubmitted || this.form.tagId) return '';
      return this.$t('aiAnalysisSettings.validationRequired');
    },
    kindError() {
      if (!this.formSubmitted) return '';
      if (!this.form.analysisKind) return this.$t('aiAnalysisSettings.validationRequired');
      if (!validateAnalysisKind(this.form.analysisKind)) {
        return this.$t('aiAnalysisSettings.validationInvalidKind');
      }
      return '';
    },
    resultUserError() {
      if (!this.formSubmitted || this.form.resultUserId) return '';
      return this.$t('aiAnalysisSettings.managementSelectResultUser');
    },
    selectedResultUser() {
      return this.resultUsers.find((user) => user._id === this.form.resultUserId) || null;
    },
  },
  watch: {
    dialogVisible(value) {
      this.visible = value;
      if (!value) {
        this.invalidateLoadRequests();
        this.invalidateSearchRequests();
      }
    },
    scope(nextScope, previousScope) {
      if (nextScope !== previousScope) this.handleScopeChange();
    },
    floorId(nextId, previousId) {
      if (nextId !== previousId) this.handleScopeChange();
    },
    roomId(nextId, previousId) {
      if (nextId !== previousId && this.scope === 'room') this.handleScopeChange();
    },
    sending(value) {
      if (value) return;
      if (this.savedSettingFocusRequest) {
        this.focusSavedSetting();
        return;
      }
      if (this.formFocusRestorePending) this.restoreFormTriggerFocus();
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
    this.invalidateSearchRequests();
  },
  methods: {
    ...userDisplayMethods,
    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },
    invalidateSearchRequests() {
      this.searchRequestVersion += 1;
      this.searching = false;
    },
    handleScopeChange() {
      if (!this.visible) return;
      this.invalidateLoadRequests();
      this.invalidateSearchRequests();
      this.loading = false;
      this.loadFailed = false;
      this.settings = [];
      this.tags = [];
      this.savedSettingFocusRequest = null;
      this.deleteDialogVisible = false;
      this.deleteTarget = null;
      this.deleteFocusRequest = null;
      this.deleteClosedFocusRequest = null;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.discardFocusPending = false;
      this.closeForm({ restoreFocus: false });
      this.$nextTick(() => {
        if (this.visible) this.openedDialog();
      });
    },
    buildScopePayload(extra = {}) {
      const payload = { floor_id: this.floorId, ...extra };
      if (this.scope === 'room') payload.room_id = this.roomId;
      return payload;
    },
    async openedDialog() {
      if (!this.floorId || (this.scope === 'room' && !this.roomId)) {
        this.loadFailed = true;
        this.showMessage('aiAnalysisSettings.loadFailed', 'alert');
        return;
      }
      await this.loadDialogData();
    },
    async loadDialogData() {
      if (this.loading || this.sending) return;
      const requestVersion = ++this.loadRequestVersion;
      const scope = this.scope;
      const floorId = this.floorId;
      const roomId = this.roomId;
      this.loading = true;
      this.loadFailed = false;
      try {
        const tagRequest =
          scope === 'floor'
            ? tagApi.floorTag.list({ floor_id: floorId })
            : tagApi.roomTag.list({ room_id: roomId });
        const [tagResponse, settingResponse] = await Promise.all([
          tagRequest,
          this.api.list(this.buildScopePayload()),
        ]);
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.tags = Array.isArray(tagResponse.data) ? tagResponse.data : [];
        this.settings = Array.isArray(settingResponse.data) ? settingResponse.data : [];
      } catch (error) {
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.loadFailed = true;
        this.showError('aiAnalysisSettings.loadFailed', error);
      } finally {
        if (requestVersion === this.loadRequestVersion) this.loading = false;
      }
    },
    async fetchSettings() {
      if (this.loading || this.sending) return;
      this.loading = true;
      try {
        const response = await this.api.list(this.buildScopePayload());
        this.settings = Array.isArray(response.data) ? response.data : [];
      } catch (error) {
        this.showError('aiAnalysisSettings.loadFailed', error);
      } finally {
        this.loading = false;
      }
    },
    requestClose() {
      if (this.closeBlocked) return;
      if (this.formVisible) {
        this.requestCloseForm();
        return;
      }
      this.invalidateLoadRequests();
      this.invalidateSearchRequests();
      this.visible = false;
    },
    handleHeaderStartAction() {
      if (this.formVisible) {
        this.requestCloseForm();
        return;
      }
      this.requestClose();
    },
    handleHeaderEndAction(event) {
      if (this.formVisible) {
        this.saveSetting();
        return;
      }
      this.openCreateForm(event);
    },
    closedDialog(payload) {
      this.resetDialogState();
      this.$emit('close', payload);
    },
    resetDialogState() {
      this.invalidateLoadRequests();
      this.savedSettingFocusRequest = null;
      this.deleteFocusRequest = null;
      this.deleteClosedFocusRequest = null;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.discardFocusPending = false;
      this.closeForm({ restoreFocus: false });
      this.loading = false;
      this.loadFailed = false;
      this.sending = false;
      this.deleteDialogVisible = false;
      this.deleteTarget = null;
      this.settings = [];
      this.tags = [];
    },
    captureFormTrigger(event) {
      const target = event?.currentTarget;
      this.formTriggerElement = target && typeof target.focus === 'function' ? target : null;
      this.formTriggerPresentation = target?.id?.includes('-mobile')
        ? 'mobile'
        : target?.id?.includes('-desktop')
          ? 'desktop'
          : null;
      this.formFocusRestorePending = false;
    },
    focusFormTag() {
      const requestVersion = ++this.formFocusRequestVersion;
      this.$nextTick(() => {
        if (!this.formVisible || requestVersion !== this.formFocusRequestVersion) return;
        this.$refs.formFields?.focusTag();
      });
    },
    restoreFormTriggerFocus() {
      if (!this.formFocusRestorePending) return;
      const trigger = this.formTriggerElement;
      this.formFocusRestorePending = false;
      this.formTriggerElement = null;
      this.formTriggerPresentation = null;
      this.$nextTick(() => {
        if (!trigger?.isConnected || trigger.disabled || typeof trigger.focus !== 'function') return;
        trigger.focus();
      });
    },
    async openCreateForm(event) {
      if (this.busy) return;
      this.invalidateSearchRequests();
      this.captureFormTrigger(event);
      this.editingSetting = null;
      this.form = createEmptyForm();
      this.initialForm = { ...this.form };
      this.formVisible = true;
      this.formSubmitted = false;
      this.validationError = '';
      this.promptValidation = null;
      this.resultUsers = [];
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.focusFormTag();
      const requestVersion = ++this.searchRequestVersion;
      this.searching = true;
      try {
        const { data: user } = await this.api.defaultResultUser(this.buildScopePayload());
        if (requestVersion !== this.searchRequestVersion || !this.visible || !this.formVisible) return;
        if (!user?._id || this.form.resultUserId) return;
        this.resultUsers = [user];
        this.form.resultUserId = user._id;
        this.initialForm.resultUserId = user._id;
      } catch (error) {
        if (requestVersion === this.searchRequestVersion && this.visible && this.formVisible) {
          this.showError('aiAnalysisSettings.managementResultUserSearchFailed', error);
        }
      } finally {
        if (requestVersion === this.searchRequestVersion) this.searching = false;
      }
    },
    openEditForm(setting, event) {
      if (this.busy || !setting) return;
      this.invalidateSearchRequests();
      this.captureFormTrigger(event);
      this.editingSetting = setting;
      this.form = {
        tagId: setting.tag?._id || '',
        analysisKind: setting.analysis_kind || '',
        additionalPrompt: setting.additional_prompt || '',
        resultUserId: setting.result_user?._id || '',
      };
      this.initialForm = { ...this.form };
      this.formVisible = true;
      this.formSubmitted = false;
      this.validationError = '';
      this.validatePrompt();
      this.resultUsers = setting.result_user ? [setting.result_user] : [];
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.focusFormTag();
    },
    closeForm(options = {}) {
      const restoreFocus = options?.restoreFocus !== false;
      this.invalidateSearchRequests();
      this.formFocusRequestVersion += 1;
      this.formVisible = false;
      this.formSubmitted = false;
      this.editingSetting = null;
      this.form = createEmptyForm();
      this.initialForm = { ...this.form };
      this.validationError = '';
      this.promptValidation = null;
      this.resultUserSearch = '';
      this.resultUserSearchCompleted = false;
      this.resultUsers = [];
      this.formFocusRestorePending = restoreFocus && Boolean(this.formTriggerElement);
      if (!restoreFocus) {
        this.formTriggerElement = null;
        this.formTriggerPresentation = null;
      }
      if (!this.sending) this.restoreFormTriggerFocus();
    },
    requestCloseForm() {
      if (this.closeBlocked) return;
      if (this.formDirty) {
        this.discardConfirmVisible = true;
        return;
      }
      this.closeForm();
    },
    confirmDiscardChanges() {
      this.discardConfirmVisible = false;
      this.discardClosePending = true;
      this.discardFocusPending = false;
    },
    cancelDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.discardFocusPending = true;
    },
    handleDiscardConfirmationClosed() {
      if (this.discardClosePending) {
        this.discardClosePending = false;
        this.closeForm();
        return;
      }
      if (!this.discardFocusPending) return;
      this.discardFocusPending = false;
      this.focusFormTag();
    },
    editButtonId(setting, presentation) {
      return `${this.idPrefix}-edit-${presentation}-${setting._id}`;
    },
    deleteButtonId(setting, presentation) {
      return `${this.idPrefix}-delete-${presentation}-${setting._id}`;
    },
    isVisibleListFocusTarget(element) {
      if (!element?.isConnected || element.disabled || typeof element.focus !== 'function') {
        return false;
      }
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        current = current.parentElement;
      }
      return true;
    },
    focusSavedSetting() {
      const request = this.savedSettingFocusRequest;
      if (!request) return;
      this.savedSettingFocusRequest = null;
      this.$nextTick(() => {
        const preferredPresentation = request.presentation || 'desktop';
        const presentations = [
          preferredPresentation,
          preferredPresentation === 'desktop' ? 'mobile' : 'desktop',
        ];
        const target = request.settingId
          ? presentations
              .map((presentation) =>
                document.getElementById(
                  `${this.idPrefix}-edit-${presentation}-${request.settingId}`
                )
              )
              .find((element) => this.isVisibleListFocusTarget(element))
          : null;
        const focusTarget = target || document.getElementById(this.titleId);
        if (!this.isVisibleListFocusTarget(focusTarget)) return;
        focusTarget.focus({ preventScroll: true });
        if (typeof focusTarget.scrollIntoView === 'function') {
          focusTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },
    validatePrompt() {
      this.promptValidation = validateAdditionalPrompt(
        this.form.additionalPrompt,
        this.form.analysisKind
      );
      return this.promptValidation;
    },
    validateForm() {
      this.formSubmitted = true;
      this.validationError = '';
      if (!this.form.tagId || !this.form.analysisKind) {
        this.focusFirstFormError();
        return false;
      }
      if (!validateAnalysisKind(this.form.analysisKind)) {
        this.focusFirstFormError();
        return false;
      }
      const prompt = this.validatePrompt();
      if (!prompt.valid) {
        this.focusFirstFormError();
        return false;
      }
      if (!this.form.resultUserId) {
        this.focusFirstFormError();
        return false;
      }
      return true;
    },
    focusFirstFormError() {
      this.$nextTick(() => {
        if (!this.form.tagId) return this.$refs.formFields?.focusTag();
        else if (!this.form.analysisKind || !validateAnalysisKind(this.form.analysisKind)) {
          return this.$refs.formFields?.focusKind();
        } else if (this.promptError) {
          return this.$refs.formFields?.focusPrompt();
        } else if (!this.form.resultUserId) {
          return this.$refs.formFields?.focusResultUserSearch();
        }
      });
    },
    async searchResultUsers() {
      if (this.sending || this.searching || !this.formVisible) return;
      const search = this.resultUserSearch.trim();
      if (search.length > 100) {
        this.validationError = this.$t('aiAnalysisSettings.validationSearchLength', { max: 100 });
        return;
      }
      const requestVersion = ++this.searchRequestVersion;
      const api = this.api;
      const payload = this.buildScopePayload({ search });
      const selected = this.resultUsers.find((user) => user._id === this.form.resultUserId);
      this.searching = true;
      this.validationError = '';
      try {
        const response = await api.searchResultUsers(payload);
        if (
          requestVersion !== this.searchRequestVersion ||
          !this.visible ||
          !this.formVisible
        ) {
          return;
        }
        const users = Array.isArray(response.data) ? [...response.data] : [];
        if (selected && !users.some((user) => user._id === selected._id)) users.unshift(selected);
        this.resultUsers = users;
        this.resultUserSearchCompleted = true;
      } catch (error) {
        if (
          requestVersion !== this.searchRequestVersion ||
          !this.visible ||
          !this.formVisible
        ) {
          return;
        }
        this.showError('aiAnalysisSettings.managementResultUserSearchFailed', error);
      } finally {
        if (requestVersion === this.searchRequestVersion) this.searching = false;
      }
    },
    async saveSetting() {
      if (this.sending || this.searching || !this.validateForm()) return;
      this.sending = true;
      try {
        const form = {
          tagId: this.form.tagId,
          analysisKind: this.form.analysisKind,
          additionalPrompt: this.promptValidation.value,
          resultUserId: this.form.resultUserId,
        };
        if (this.editingSetting) {
          form._id = this.editingSetting._id;
          form.revision = this.editingSetting.revision;
        }
        const payload = buildSettingPayload({
          scope: this.scope,
          form,
          floorId: this.floorId,
          roomId: this.roomId,
        });
        const operation = this.editingSetting ? this.api.update : this.api.create;
        const response = await operation(payload);
        this.savedSettingFocusRequest = {
          settingId: response?.data?._id || form._id || null,
          presentation: this.formTriggerPresentation,
        };
        this.closeForm({ restoreFocus: false });
        this.showMessage('aiAnalysisSettings.saved');
        await this.reloadAfterMutation();
      } catch (error) {
        await this.handleMutationError(error, 'aiAnalysisSettings.saveFailed');
      } finally {
        this.sending = false;
      }
    },
    settingResourceName(setting) {
      return `${this.kindLabel(setting?.analysis_kind)} / ${this.getTagName(setting?.tag)}`;
    },
    openDeleteConfirmation(setting, event) {
      if (this.busy || !setting) return;
      const index = this.settings.findIndex((candidate) => candidate._id === setting._id);
      const targetId = event?.currentTarget?.id || '';
      this.deleteFocusRequest = {
        candidateIds: [this.settings[index + 1]?._id, this.settings[index - 1]?._id].filter(Boolean),
        presentation: targetId.includes('-mobile') ? 'mobile' : 'desktop',
      };
      this.deleteClosedFocusRequest = null;
      this.deleteTarget = setting;
      this.deleteDialogVisible = true;
    },
    closeDeleteConfirmation() {
      if (this.sending || !this.deleteDialogVisible) return;
      this.deleteDialogVisible = false;
      this.deleteClosedFocusRequest = null;
    },
    buildClosedDeleteFocusRequest(request) {
      const targetId = request?.candidateIds.find((id) =>
        this.settings.some((candidate) => candidate._id === id)
      );
      return {
        settingId: targetId || null,
        presentation: request?.presentation || null,
      };
    },
    handleDeleteDialogClosed() {
      const focusRequest = this.deleteClosedFocusRequest;
      this.deleteTarget = null;
      this.deleteFocusRequest = null;
      this.deleteClosedFocusRequest = null;
      if (!focusRequest) return;
      this.savedSettingFocusRequest = focusRequest;
      this.focusSavedSetting();
    },
    async confirmDeleteSetting() {
      const setting = this.deleteTarget;
      if (this.sending || !setting) return;
      this.sending = true;
      try {
        const payload = this.buildScopePayload({ _id: setting._id, revision: setting.revision });
        await this.api.remove(payload);
        this.settings = this.settings.filter((candidate) => candidate._id !== setting._id);
        this.showMessage('aiAnalysisSettings.deleted');
        await this.reloadAfterMutation();
        this.deleteClosedFocusRequest = this.buildClosedDeleteFocusRequest(
          this.deleteFocusRequest
        );
        this.deleteDialogVisible = false;
      } catch (error) {
        if (isRevisionConflict(error) || error?.response?.status === 404) {
          const focusRequest = this.deleteFocusRequest;
          try {
            await this.fetchSettingsAfterMutation();
            this.showMessage('aiAnalysisSettings.conflictReloaded', 'alert');
          } catch (reloadError) {
            this.showError('aiAnalysisSettings.loadFailed', reloadError);
          }
          this.deleteClosedFocusRequest = this.buildClosedDeleteFocusRequest(focusRequest);
          this.deleteDialogVisible = false;
          return;
        }
        this.showError('aiAnalysisSettings.deleteFailed', error);
      } finally {
        this.sending = false;
      }
    },
    async fetchSettingsAfterMutation() {
      const requestVersion = ++this.loadRequestVersion;
      const api = this.api;
      const payload = this.buildScopePayload();
      this.loading = true;
      this.loadFailed = false;
      try {
        const response = await api.list(payload);
        if (requestVersion !== this.loadRequestVersion || !this.visible) return false;
        this.settings = Array.isArray(response.data) ? response.data : [];
        return true;
      } catch (error) {
        if (requestVersion !== this.loadRequestVersion || !this.visible) return false;
        this.loadFailed = true;
        throw error;
      } finally {
        if (requestVersion === this.loadRequestVersion) this.loading = false;
      }
    },
    async reloadAfterMutation() {
      try {
        return await this.fetchSettingsAfterMutation();
      } catch (error) {
        this.showError('aiAnalysisSettings.loadFailed', error);
        return false;
      }
    },
    async handleMutationError(error, failureKey) {
      if (isRevisionConflict(error) || error?.response?.status === 404) {
        this.savedSettingFocusRequest = {
          settingId: this.editingSetting?._id || null,
          presentation: this.formTriggerPresentation,
        };
        this.closeForm({ restoreFocus: false });
        try {
          await this.fetchSettingsAfterMutation();
        } catch (reloadError) {
          this.showError('aiAnalysisSettings.loadFailed', reloadError);
          return;
        }
        this.showMessage('aiAnalysisSettings.conflictReloaded', 'alert');
        return;
      }
      this.showError(failureKey, error);
    },
    getTagName(tag) {
      return tag ? TranslationUtil.getTagName(tag, this.$i18n.locale) : '';
    },
    kindLabel(kind) {
      const suffix = {
        vision: 'Vision',
        audioScene: 'AudioScene',
        speech: 'Speech',
        video: 'Video',
        conversation: 'Conversation',
      }[kind];
      return suffix ? this.$t(`aiAnalysisSettings.kind${suffix}`) : kind;
    },
    showMessage(key, role = 'status') {
      showSnackbar(this.$store, this.$t(key), role);
    },
    showError(key, error) {
      const message = appendApiErrorMessage(this.$t(key), error, { translate: this.$t });
      showSnackbar(this.$store, message, 'alert');
      handleAuthError(error, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
:global(.scoped-ai-analysis-settings-dialog) {
  --ui-dialog-width: 920px;
}

.settings-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.settings-load-error {
  padding: 24px 16px;
  color: var(--ui-color-danger);
  text-align: center;
}

.settings-load-error p {
  margin: 0 0 16px;
}

.settings-table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

.settings-table {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
}

.settings-table th,
.settings-table td {
  padding: 8px;
  border-bottom: 1px solid #cccccc;
  text-align: start;
  vertical-align: top;
}

.settings-table th {
  background: #f7f7f7;
  white-space: nowrap;
}

.settings-tag-column {
  min-width: 10rem;
}

.settings-kind-column {
  min-width: 6rem;
}

.settings-prompt-column {
  min-width: 14rem;
  white-space: pre-wrap;
}

.settings-result-user-column {
  min-width: 8rem;
}

.settings-action-buttons {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.settings-action-buttons :deep(.ui-button) {
  margin: 0;
}

.settings-card-list {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-card {
  border: 1px solid var(--ui-color-border);
  border-radius: 4px;
  background-color: #ffffff;
}

.settings-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ui-color-border);
}

.settings-card-header h3 {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 1rem;
}

.settings-card-details {
  margin: 0;
  padding: 0 16px;
}

.settings-card-details > div {
  display: grid;
  grid-template-columns: minmax(6.5rem, max-content) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-color-border);
}

.settings-card-details dt {
  font-weight: 600;
}

.settings-card-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.settings-card-prompt {
  white-space: pre-wrap;
}

.settings-card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
}

.setting-form-actions,
.common-dialog-actions {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 8px;
}

.setting-delete-context {
  display: grid;
  gap: 8px;
}

@media (max-width: 896px) {
  :global(.scoped-ai-analysis-settings-dialog .ui-dialog__actions) {
    display: none;
  }

  .settings-table-wrap {
    display: none;
  }

  .settings-card-list {
    display: grid;
    gap: 12px;
  }

  .settings-card-actions .settings-action-buttons {
    width: 100%;
  }

  .settings-card-actions :deep(.ui-button) {
    flex: 1;
  }

  .setting-form-actions {
    flex-wrap: wrap;
  }
}
</style>
