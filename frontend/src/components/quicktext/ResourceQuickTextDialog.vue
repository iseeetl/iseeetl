<template>
  <UiDialog
    class="resource-quicktext-dialog"
    :open="visible"
    :title-id="titleId"
    :description-ids="contextId"
    :initial-focus="`#${titleId}`"
    :close-on-escape="!closeBlocked"
    :close-on-backdrop="!closeBlocked"
    :data-testid="`resource-quicktext-dialog-${resource}`"
    @request-close="requestClose"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="editorVisible ? $t('戻る') : $t('閉じる')"
        :disabled="closeBlocked"
        data-testid="quicktext-dialog-header-start"
        @click.stop="handleHeaderStartAction"
      >
        <UiIcon :name="editorVisible ? 'chevron_left' : 'close'" />
      </UiButton>

      <h2 :id="titleId" class="ui-dialog__heading" tabindex="-1">
        {{ currentTitle }}
      </h2>

      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="editorVisible ? formActionLabel : $t('単語グループ作成')"
        :disabled="busy || (!editorVisible && !canManage)"
        data-testid="quicktext-dialog-header-end"
        @click.stop="handleHeaderEndAction"
      >
        <UiIcon :name="editorVisible ? 'done' : 'add'" />
      </UiButton>
    </template>

    <DialogTargetContext
      class="quicktext-target-context"
      :context-id="contextId"
      :label="targetLabel"
      :name="targetName"
    />

    <section
      v-show="!editorVisible"
      class="quicktext-screen quicktext-list-screen"
      :aria-busy="busy ? 'true' : 'false'"
      :aria-labelledby="titleId"
      data-testid="quicktext-dialog-list-screen"
    >
      <div v-if="!loading && !loadFailed" class="quicktext-summary">
        <span>{{ $t('全{total}件', { total: formattedGroupCount }, groups.length) }}</span>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy || !canManage"
          data-testid="quicktext-dialog-create-group"
          @click="openGroupForm(null, $event)"
        >
          {{ $t('単語グループ作成') }}
        </UiButton>
      </div>

      <div v-if="loading" class="quicktext-state" role="status">
        {{ $t('読み込み中です') }}
      </div>

      <div v-else-if="loadFailed" class="quicktext-state quicktext-state--error" role="alert">
        <p>{{ $t('単語グループの取得に失敗しました') }}</p>
        <UiButton appearance="filled" tone="primary" :disabled="busy" @click="loadData">
          {{ $t('再試行') }}
        </UiButton>
      </div>

      <div v-else-if="groups.length === 0" class="quicktext-state" role="status">
        {{ $t('単語がありません') }}
      </div>

      <ResourceQuickTextList
        v-else
        :resource="resource"
        :groups="groups"
        :items-by-group-id="itemsByGroupId"
        :sending="busy"
        :user-is-login="userIsLogin"
        :can-manage="canManage"
        :show-create-group-action="false"
        :emphasize-translation-labels="resource === 'room'"
        @create-item="openNewItemForm"
        @edit-group="openGroupForm"
        @delete-group="confirmDeleteGroup"
        @edit-item="openItemForm"
        @delete-item="confirmDeleteItem"
        @groups-drag-end="onGroupsDragEnd"
        @items-drag-end="onItemsDragEnd"
      />
    </section>

    <section
      v-if="editorVisible"
      class="quicktext-screen quicktext-editor-screen"
      :aria-labelledby="titleId"
      data-testid="quicktext-dialog-editor-screen"
    >
      <DialogTargetContext
        v-if="editorKind === 'item' && editorGroup"
        :label="$t('単語グループ名')"
        :name="editorGroup.title"
      />

      <UiField
        :control-id="formControlId"
        :label="`${formLabel} ${$t('200文字まで')} ${$t('必須')}`"
        :invalid="Boolean(formError)"
        :error="formError"
        counter
      >
        <template #default="{ controlAttrs }">
          <input
            v-bind="controlAttrs"
            ref="formControl"
            v-model="formValue"
            maxlength="200"
            dir="auto"
            :disabled="sending"
            aria-required="true"
            required
            @blur="formTouched = true"
            @keydown.enter="onFormEnter"
          />
        </template>
      </UiField>
    </section>

    <template #actions>
      <div v-show="editorVisible" class="quicktext-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="busy"
          @click="requestCloseEditor"
        >
          {{ $t('戻る') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="busy"
          data-testid="quicktext-dialog-save"
          @click="saveForm"
        >
          {{ formActionLabel }}
        </UiButton>
      </div>

      <div v-show="!editorVisible" class="quicktext-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :disabled="closeBlocked"
          data-testid="quicktext-dialog-close"
          @click="requestClose"
        >
          {{ $t('閉じる') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending || confirmSending"
        mode="indeterminate"
        :aria-labelledby="titleId"
      />
    </template>
  </UiDialog>

  <ConfirmDialog
    :dialog-visible="confirmVisible"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="$t('削除')"
    :cancel-label="$t('キャンセル')"
    :sending="confirmSending"
    :actions-adjacent="true"
    :close-on-confirm="false"
    :close-on-escape="true"
    :close-on-backdrop="true"
    confirm-icon="delete"
    @confirm="onConfirmDelete"
    @cancel="onCancelDelete"
    @closed="handleDeleteConfirmationClosed"
  >
    <div class="quicktext-delete-details">
      <p>{{ confirmMessage }}</p>
      <DialogTargetContext :label="targetLabel" :name="targetName" />
      <DialogTargetContext
        :label="confirmTargetLabel"
        :name="confirmTargetName"
      />
    </div>
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

<script>
import quickTextAPI from '@/api/quickText';
import { appendApiErrorMessage } from '@/api/apiClient';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import ResourceQuickTextList from '@/components/quicktext/ResourceQuickTextList.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { handleAuthError } from '@/utils/authError';
import { normalizeSupportedLocale } from '@/utils/locale';
import { showSnackbar } from '@/utils/snackbar';

const createItemsMap = () => Object.create(null);

const normalizeList = (data) => (Array.isArray(data) ? data : data?.docs || []);

export default {
  name: 'ResourceQuickTextDialog',
  components: {
    ConfirmDialog,
    DialogTargetContext,
    ResourceQuickTextList,
    UiButton,
    UiDialog,
    UiField,
    UiIcon,
    UiProgress,
  },
  emits: ['close'],
  props: {
    dialogVisible: {
      type: Boolean,
      default: false,
    },
    resource: {
      type: String,
      required: true,
      validator: (value) => value === 'floor' || value === 'room',
    },
    resourceId: {
      type: String,
      required: true,
    },
    targetName: {
      type: String,
      default: '',
    },
    canManage: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      visible: this.dialogVisible,
      groups: [],
      itemsByGroupId: createItemsMap(),
      loading: false,
      loadFailed: false,
      sending: false,
      loadRequestVersion: 0,

      editorKind: null,
      editorValue: null,
      editorGroup: null,
      formValue: '',
      initialFormValue: '',
      formTouched: false,
      formSubmitted: false,
      formTriggerElement: null,
      discardConfirmVisible: false,
      discardClosePending: false,
      discardFocusPending: false,

      confirmVisible: false,
      confirmTitle: '',
      confirmMessage: '',
      confirmKind: null,
      confirmTarget: null,
      confirmGroup: null,
      confirmFocusRequest: null,
      deleteClosedFocusRequest: null,
      confirmSending: false,
    };
  },
  computed: {
    userIsLogin() {
      return Boolean(this.$store.getters.userIsLogin);
    },
    userToken() {
      return this.$store.getters.userToken;
    },
    busy() {
      return this.loading || this.sending || this.confirmSending;
    },
    closeBlocked() {
      return this.sending || this.confirmSending;
    },
    editorVisible() {
      return this.editorKind !== null;
    },
    baseTitle() {
      return this.resource === 'floor' ? this.$t('フロア単語') : this.$t('ルーム単語');
    },
    currentTitle() {
      if (this.editorKind === 'group') {
        return this.editorValue ? this.$t('単語グループ編集') : this.$t('単語グループ作成');
      }
      if (this.editorKind === 'item') {
        return this.editorValue ? this.$t('単語編集') : this.$t('単語作成');
      }
      return this.baseTitle;
    },
    targetLabel() {
      return this.resource === 'floor' ? this.$t('対象フロア') : this.$t('対象ルーム');
    },
    idPrefix() {
      return `resource-quicktext-${this.resource}`;
    },
    titleId() {
      return `${this.idPrefix}-dialog-title`;
    },
    contextId() {
      return `${this.idPrefix}-dialog-context`;
    },
    formControlId() {
      return `${this.idPrefix}-${this.editorKind || 'entry'}-value`;
    },
    formLabel() {
      return this.editorKind === 'group' ? this.$t('タイトル') : this.$t('名称');
    },
    formattedGroupCount() {
      return typeof this.$n === 'function' ? this.$n(this.groups.length) : String(this.groups.length);
    },
    formActionLabel() {
      return this.editorValue ? this.$t('managementUi.save') : this.$t('作成');
    },
    formDirty() {
      return this.formValue !== this.initialFormValue;
    },
    confirmTargetName() {
      if (!this.confirmTarget) return '';
      return this.confirmKind === 'group' ? this.confirmTarget.title : this.confirmTarget.label;
    },
    confirmTargetLabel() {
      return this.confirmKind === 'group' ? this.$t('単語グループ名') : this.$t('名称');
    },
    formError() {
      if (!this.formTouched && !this.formSubmitted) return '';
      if (!this.formValue) return this.$t('必須');
      if ([...this.formValue].length > 200) return this.$t('200文字まで');
      return '';
    },
  },
  watch: {
    dialogVisible(value) {
      this.visible = value;
      if (!value) this.invalidateLoadRequests();
    },
    resourceId(nextId, previousId) {
      if (!this.visible || !nextId || nextId === previousId) return;
      this.resetListState();
      this.loadData();
    },
  },
  beforeUnmount() {
    this.invalidateLoadRequests();
  },
  methods: {
    buildPayload(extra = {}) {
      return { resource: this.resource, resourceId: this.resourceId, ...extra };
    },
    showMessage(message, role = 'status') {
      showSnackbar(this.$store, this.$t(message), role);
    },
    showError(message, error, { handleAuthentication = true } = {}) {
      const detail = appendApiErrorMessage(this.$t(message), error, { translate: this.$t });
      showSnackbar(this.$store, detail, 'alert');
      if (handleAuthentication) {
        handleAuthError(error, { store: this.$store, router: this.$router });
      }
    },
    invalidateLoadRequests() {
      this.loadRequestVersion += 1;
    },
    resetListState() {
      this.invalidateLoadRequests();
      this.groups = [];
      this.itemsByGroupId = createItemsMap();
      this.loading = false;
      this.loadFailed = false;
    },
    async openedDialog() {
      await this.loadData();
    },
    async loadData() {
      if (!this.resourceId || this.loading) return;
      const requestVersion = ++this.loadRequestVersion;
      const resource = this.resource;
      const resourceId = this.resourceId;
      const userToken = this.userToken;
      const buildReadArgs = (payload) => (resource === 'floor' ? [userToken, payload] : [payload]);
      this.loading = true;
      this.loadFailed = false;
      try {
        const groupsResponse = await quickTextAPI.getGroups(
          ...buildReadArgs({ resource, resourceId })
        );
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        const groups = normalizeList(groupsResponse.data);
        const itemEntries = await Promise.all(
          groups.map(async (group) => {
            const response = await quickTextAPI.getItems(
              ...buildReadArgs({ resource, resourceId, groupId: group._id })
            );
            return [group._id, normalizeList(response.data)];
          })
        );
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.groups = groups;
        this.itemsByGroupId = Object.fromEntries(itemEntries);
      } catch (error) {
        if (requestVersion !== this.loadRequestVersion || !this.visible) return;
        this.loadFailed = true;
        this.showError('単語グループの取得に失敗しました', error, {
          handleAuthentication: resource === 'floor',
        });
      } finally {
        if (requestVersion === this.loadRequestVersion) this.loading = false;
      }
    },
    requestClose() {
      if (this.closeBlocked) return;
      if (this.editorVisible) {
        this.requestCloseEditor();
        return;
      }
      this.invalidateLoadRequests();
      this.visible = false;
    },
    handleHeaderStartAction() {
      if (this.editorVisible) {
        this.requestCloseEditor();
        return;
      }
      this.requestClose();
    },
    handleHeaderEndAction(event) {
      if (this.editorVisible) {
        this.saveForm();
        return;
      }
      this.openGroupForm(null, event);
    },
    closedDialog(payload) {
      this.invalidateLoadRequests();
      this.resetEditorState();
      this.resetConfirmState();
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.discardFocusPending = false;
      this.resetListState();
      this.$emit('close', payload);
    },
    captureFormTrigger(event) {
      const target = event?.currentTarget || document.activeElement;
      this.formTriggerElement = target && typeof target.focus === 'function' ? target : null;
    },
    focusFormControl() {
      this.$nextTick(() => {
        const control = this.$refs.formControl;
        if (!control || typeof control.focus !== 'function') return;
        control.focus({ preventScroll: true });
        if (typeof control.scrollIntoView === 'function') {
          control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },
    openGroupForm(group = null, event = null) {
      if (this.busy || !this.canManage) return;
      this.captureFormTrigger(event);
      this.editorKind = 'group';
      this.editorValue = group;
      this.editorGroup = null;
      this.formValue = group?.title || '';
      this.initialFormValue = this.formValue;
      this.formTouched = false;
      this.formSubmitted = false;
      this.focusFormControl();
    },
    openItemForm(item = null, group = null, event = null) {
      if (this.busy || !this.canManage || !group) return;
      this.captureFormTrigger(event);
      this.editorKind = 'item';
      this.editorValue = item;
      this.editorGroup = group;
      this.formValue = item?.label || '';
      this.initialFormValue = this.formValue;
      this.formTouched = false;
      this.formSubmitted = false;
      this.focusFormControl();
    },
    openNewItemForm(group, event = null) {
      this.openItemForm(null, group, event);
    },
    restoreFormTriggerFocus() {
      const trigger = this.formTriggerElement;
      this.formTriggerElement = null;
      this.$nextTick(() => {
        if (!trigger?.isConnected || trigger.disabled || typeof trigger.focus !== 'function') return;
        trigger.focus({ preventScroll: true });
      });
    },
    resetEditorState() {
      this.editorKind = null;
      this.editorValue = null;
      this.editorGroup = null;
      this.formValue = '';
      this.initialFormValue = '';
      this.formTouched = false;
      this.formSubmitted = false;
      this.formTriggerElement = null;
    },
    closeEditor() {
      if (this.sending) return;
      const shouldRestoreFocus = Boolean(this.formTriggerElement);
      const trigger = this.formTriggerElement;
      this.resetEditorState();
      if (shouldRestoreFocus) {
        this.formTriggerElement = trigger;
        this.restoreFormTriggerFocus();
      }
    },
    requestCloseEditor() {
      if (this.closeBlocked) return;
      if (this.formDirty) {
        this.discardConfirmVisible = true;
        return;
      }
      this.closeEditor();
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
        this.closeEditor();
        return;
      }
      if (!this.discardFocusPending) return;
      this.discardFocusPending = false;
      this.focusFormControl();
    },
    validateForm() {
      this.formSubmitted = true;
      if (!this.formError) return true;
      this.focusFormControl();
      return false;
    },
    onFormEnter(event) {
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      this.saveForm();
    },
    async saveForm() {
      if (this.sending || !this.canManage || !this.validateForm()) return;
      const editorKind = this.editorKind;
      const editingValue = this.editorValue;
      const editorGroup = this.editorGroup;
      const value = this.formValue;
      let focusTarget = null;
      this.sending = true;
      try {
        const lang = normalizeSupportedLocale(
          editingValue?.lang || this.$store.getters.lang,
          normalizeSupportedLocale(this.$store.getters.lang, 'ja')
        );
        let response;
        if (editorKind === 'group') {
          response = editingValue
            ? await quickTextAPI.updateGroup(this.userToken, this.buildPayload({
                id: editingValue._id,
                title: value,
                lang,
              }))
            : await quickTextAPI.createGroup(this.userToken, this.buildPayload({ title: value, lang }));
          this.showMessage(editingValue ? '単語グループを更新しました' : '単語グループを作成しました');
        } else if (editorKind === 'item' && editorGroup) {
          response = editingValue
            ? await quickTextAPI.updateItem(this.userToken, this.buildPayload({
                id: editingValue._id,
                label: value,
                lang,
              }))
            : await quickTextAPI.createItem(this.userToken, this.buildPayload({
                groupId: editorGroup._id,
                label: value,
                lang,
              }));
          this.showMessage(editingValue ? '単語を更新しました' : '単語を作成しました');
        } else {
          return;
        }

        focusTarget = {
          kind: editorKind,
          id: response?.data?._id || editingValue?._id || null,
        };
        this.resetEditorState();
        await this.loadData();
      } catch (error) {
        this.showError(editorKind === 'group' ? '単語グループの保存に失敗しました' : '単語の保存に失敗しました', error);
      } finally {
        this.sending = false;
      }
      if (focusTarget) this.focusSavedEntry(focusTarget);
    },
    focusSavedEntry(target) {
      this.$nextTick(() => {
        const id = target?.id
          ? `${this.resource}-quicktext-${target.kind}-edit-${target.id}`
          : this.titleId;
        const element = document.getElementById(id) || document.getElementById(this.titleId);
        if (!element || typeof element.focus !== 'function') return;
        element.focus({ preventScroll: true });
        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },
    async onGroupsDragEnd(event) {
      if (!this.canManage || !event || event.newIndex === event.oldIndex) return;
      const previousGroups = this.groups.map((group) => ({ ...group }));
      if (event.newIndex >= 0 && event.oldIndex >= 0) {
        const [movedGroup] = previousGroups.splice(event.newIndex, 1);
        if (movedGroup) previousGroups.splice(event.oldIndex, 0, movedGroup);
      }
      this.groups = this.groups.map((group, index) => ({ ...group, order: index + 1 }));
      this.sending = true;
      try {
        await Promise.all(
          this.groups.map((group) =>
            quickTextAPI.updateGroup(this.userToken, this.buildPayload({ id: group._id, order: group.order }))
          )
        );
        this.showMessage('単語グループの表示順番を更新しました');
      } catch (error) {
        this.groups = previousGroups;
        this.showError('単語グループの表示順番の更新に失敗しました', error);
      } finally {
        this.sending = false;
      }
    },
    async onItemsDragEnd(groupId, event = null) {
      if (!this.canManage || !event || event.newIndex === event.oldIndex) return;
      const list = this.itemsByGroupId[groupId] || [];
      if (!list.length) return;
      const previousItems = list.map((item) => ({ ...item }));
      if (event.newIndex >= 0 && event.oldIndex >= 0) {
        const [movedItem] = previousItems.splice(event.newIndex, 1);
        if (movedItem) previousItems.splice(event.oldIndex, 0, movedItem);
      }
      this.itemsByGroupId[groupId] = list.map((item, index) => ({ ...item, order: index + 1 }));
      this.sending = true;
      try {
        await Promise.all(
          this.itemsByGroupId[groupId].map((item) =>
            quickTextAPI.updateItem(this.userToken, this.buildPayload({ id: item._id, order: item.order }))
          )
        );
        this.showMessage('単語の表示順番を更新しました');
      } catch (error) {
        this.itemsByGroupId[groupId] = previousItems;
        this.showError('単語の表示順番の更新に失敗しました', error);
      } finally {
        this.sending = false;
      }
    },
    confirmDeleteGroup(group) {
      if (this.busy || !this.canManage) return;
      const index = this.groups.findIndex((candidate) => candidate._id === group._id);
      this.deleteClosedFocusRequest = null;
      this.confirmKind = 'group';
      this.confirmTarget = group;
      this.confirmGroup = null;
      this.confirmFocusRequest = {
        kind: 'group',
        candidateIds: [this.groups[index + 1]?._id, this.groups[index - 1]?._id].filter(Boolean),
      };
      this.confirmTitle = this.$t('単語グループを削除');
      this.confirmMessage = this.$t('この単語グループを削除しますか？配下単語も削除されます。');
      this.confirmVisible = true;
    },
    confirmDeleteItem(item, group) {
      if (this.busy || !this.canManage) return;
      const items = this.itemsByGroupId[group._id] || [];
      const index = items.findIndex((candidate) => candidate._id === item._id);
      this.deleteClosedFocusRequest = null;
      this.confirmKind = 'item';
      this.confirmTarget = item;
      this.confirmGroup = group;
      this.confirmFocusRequest = {
        kind: 'item',
        groupId: group._id,
        candidateIds: [items[index + 1]?._id, items[index - 1]?._id].filter(Boolean),
      };
      this.confirmTitle = this.$t('単語を削除');
      this.confirmMessage = this.$t('この単語を削除しますか？');
      this.confirmVisible = true;
    },
    async onConfirmDelete() {
      if (!this.confirmTarget || this.confirmSending) return;
      const kind = this.confirmKind;
      const target = this.confirmTarget;
      const focusRequest = this.confirmFocusRequest;
      this.confirmSending = true;
      try {
        if (kind === 'group') {
          await quickTextAPI.deleteGroup(this.userToken, this.buildPayload({ id: target._id }));
          this.showMessage('単語グループを削除しました');
        } else if (kind === 'item') {
          await quickTextAPI.deleteItem(this.userToken, this.buildPayload({ id: target._id }));
          this.showMessage('単語を削除しました');
        }
        await this.loadData();
        this.deleteClosedFocusRequest = focusRequest;
        this.confirmVisible = false;
      } catch (error) {
        this.showError(kind === 'group' ? '単語グループの削除に失敗しました' : '単語の削除に失敗しました', error, { handleAuthentication: false });
        if (!handleAuthError(error, { store: this.$store, router: this.$router }) && kind === 'group') {
          await this.loadData();
          if (!this.loadFailed && !this.groups.some((group) => group._id === target._id)) {
            this.deleteClosedFocusRequest = focusRequest;
            this.confirmVisible = false;
          }
        }
      } finally {
        this.confirmSending = false;
      }
    },
    handleDeleteConfirmationClosed() {
      const focusRequest = this.deleteClosedFocusRequest;
      this.resetConfirmState();
      if (focusRequest) this.focusAfterDelete(focusRequest);
    },
    focusAfterDelete(request) {
      if (request?.kind === 'item') {
        const items = this.itemsByGroupId[request.groupId] || [];
        const itemId = request.candidateIds.find((id) =>
          items.some((candidate) => candidate._id === id)
        );
        if (itemId) {
          this.focusSavedEntry({ kind: 'item', id: itemId });
          return;
        }
        if (this.groups.some((group) => group._id === request.groupId)) {
          this.focusSavedEntry({ kind: 'group', id: request.groupId });
          return;
        }
      }
      if (request?.kind === 'group') {
        const groupId = request.candidateIds.find((id) =>
          this.groups.some((candidate) => candidate._id === id)
        );
        if (groupId) {
          this.focusSavedEntry({ kind: 'group', id: groupId });
          return;
        }
      }
      this.focusSavedEntry({ kind: 'group', id: null });
    },
    resetConfirmState() {
      this.confirmVisible = false;
      this.confirmTitle = '';
      this.confirmMessage = '';
      this.confirmKind = null;
      this.confirmTarget = null;
      this.confirmGroup = null;
      this.confirmFocusRequest = null;
      this.deleteClosedFocusRequest = null;
    },
    onCancelDelete() {
      if (this.confirmSending || !this.confirmVisible) return;
      this.deleteClosedFocusRequest = null;
      this.confirmVisible = false;
    },
  },
};
</script>

<style scoped>
:global(.resource-quicktext-dialog) {
  --ui-dialog-width: 960px;
}

:global(.resource-quicktext-dialog .ui-dialog__panel) {
  overflow: hidden;
}

:global(.resource-quicktext-dialog .ui-dialog__header),
:global(.resource-quicktext-dialog .ui-dialog__actions),
:global(.resource-quicktext-dialog .ui-dialog__status) {
  flex: 0 0 auto;
}

:global(.resource-quicktext-dialog .ui-dialog__content) {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.quicktext-screen {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.quicktext-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.quicktext-target-context {
  flex: 0 0 auto;
  margin-bottom: 12px;
}

.quicktext-state {
  padding: 32px 16px;
  color: #555;
  text-align: center;
}

.quicktext-state p {
  margin: 0 0 16px;
}

.quicktext-state .ui-button {
  margin: 0;
}

.quicktext-state--error {
  color: var(--ui-color-danger);
}

.quicktext-editor-screen {
  display: grid;
  align-content: start;
  gap: 20px;
  padding-top: 4px;
}

.quicktext-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 8px;
}

.quicktext-delete-details {
  display: grid;
  gap: 8px;
}

.quicktext-delete-details > p {
  margin: 0 0 8px;
}

@media screen and (max-width: 896px) {
  :global(.resource-quicktext-dialog .ui-dialog__panel) {
    height: calc(100vh - 16px);
    height: calc(100dvh - 16px);
  }

  :global(.resource-quicktext-dialog .ui-dialog__content) {
    padding: 0 max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
  }

  :global(.resource-quicktext-dialog .ui-dialog__actions) {
    display: none;
  }

  :global(.resource-quicktext-dialog .ui-dialog__heading) {
    max-width: calc(100% - 128px);
  }
}
</style>
