<template>
  <TagListDialog
    ref="tagListDialog"
    :dialog-visible="dialogVisible"
    :scope-id="roomId"
    :scope-name="roomName"
    :config="tagDialogConfig"
    :screen="screen"
    :editor-title="editorTitle"
    :editor-submit-label="editorSubmitLabel"
    :external-sending="sending || deleteSending || resetSending"
    :list-close-end-aligned="true"
    @back="requestCloseEditor"
    @close="onClose"
    @create="openCreateEditor"
    @delete="openDeleteConfirmation"
    @reset-request="openResetConfirmation"
    @submit="saveTag"
    @update="openEditEditor"
  >
    <template #editor>
      <div class="room-tag-editor">
        <UiField
          control-id="room_tag_order"
          :label="$t('表示順番（1以上 100以下）')"
          :invalid="Boolean(orderError)"
          :error="orderError"
        >
          <template #default="{ controlAttrs }">
            <input
              v-bind="controlAttrs"
              ref="orderInput"
              v-model="form.order"
              type="number"
              autocomplete="off"
              min="1"
              max="100"
              :disabled="sending"
            />
          </template>
        </UiField>

        <UiField
          control-id="room_tag_name"
          counter
          :label="`${$t('タグ名')} ${$t('必須')} ${$t('50文字まで')}`"
          :invalid="Boolean(nameError)"
          :error="nameError"
        >
          <template #default="{ controlAttrs }">
            <input
              v-bind="controlAttrs"
              ref="nameInput"
              v-model="form.name"
              dir="auto"
              maxlength="50"
              :disabled="sending"
              aria-required="true"
              required
              @blur="formTouched = true"
            />
          </template>
        </UiField>
      </div>
    </template>
  </TagListDialog>

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

  <ConfirmDialog
    :dialog-visible="deleteConfirmVisible"
    :title="$t('ルームタグ削除')"
    :message="''"
    :confirm-label="$t('削除')"
    :cancel-label="$t('キャンセル')"
    :sending="deleteSending"
    :actions-adjacent="true"
    :close-on-confirm="false"
    :close-on-escape="true"
    :close-on-backdrop="true"
    confirm-icon="delete"
    @confirm="deleteTag"
    @cancel="closeDeleteConfirmation"
    @closed="handleDeleteConfirmationClosed"
  >
    <div class="room-tag-confirm-details">
      <DialogTargetContext :label="$t('対象ルーム')" :name="roomName" />
      <DialogTargetContext
        v-if="deleteTarget"
        :label="$t('対象タグ')"
        :name="deleteTarget.name || ''"
      />
      <p>{{ $t('ルームタグを削除する') }}</p>
    </div>
  </ConfirmDialog>

  <ConfirmDialog
    :dialog-visible="resetConfirmVisible"
    :title="$t('確認')"
    :message="''"
    :confirm-label="$t('フロアタグに戻す')"
    :cancel-label="$t('キャンセル')"
    :sending="resetSending"
    :actions-adjacent="true"
    :close-on-confirm="false"
    :close-on-escape="true"
    :close-on-backdrop="true"
    @confirm="resetToFloorTags"
    @cancel="closeResetConfirmation"
  >
    <div class="room-tag-confirm-details">
      <DialogTargetContext :label="$t('対象ルーム')" :name="roomName" />
      <p>{{ $t('フロアタグにないルームタグは一覧から外れます。') }}</p>
    </div>
  </ConfirmDialog>
</template>

<script>
import tagApi from '@/api/tag';
import { appendApiErrorMessage } from '@/api/apiClient';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import TagListDialog from '@/components/tag/TagListDialog.vue';
import UiField from '@/components/ui/UiField.vue';
import {
  buildTagDeletePayload,
  buildTagUpsertPayload,
  normalizeTagOrderInput,
} from '@/features/tag/shared/tagCore';
import { handleAuthError } from '@/utils/authError';
import { showSnackbar } from '@/utils/snackbar';

const ROOM_TAG_DIALOG_CONFIG = Object.freeze({
  scope: 'room',
  api: Object.freeze({
    list: (...args) => tagApi.roomTag.list(...args),
    importCsv: (...args) => tagApi.roomTag.importCsv(...args),
    exportCsv: (...args) => tagApi.roomTag.exportCsv(...args),
    reset: (...args) => tagApi.roomTag.resetToFloor(...args),
  }),
  titleId: 'room_tag_dialog_title',
  titleKey: 'ルームタグ一覧',
  targetLabelKey: '対象ルーム',
  resourceLabelKey: 'ルームタグ',
  csvInputId: 'room_tag_csvupload',
  csvExportDescriptionId: 'room_tag_csv_export_description',
  csvFilename: 'roomtag.csv',
  resetDescriptionId: 'tag_reset',
  resetLabelKey: 'フロアタグに戻す',
  resetSuccessKey: 'フロアタグへ戻しました',
  resetFailureKey: 'フロアタグへ戻すのに失敗しました',
  fetchFailureKey: 'ルームタグの取得に失敗しました',
  confirmReset: true,
});

const createForm = (tag = null) => ({
  order: tag?.order ?? null,
  name: tag?.name || '',
});

const normalizedFormValue = (form) => ({
  order: form.order === null || form.order === undefined ? '' : String(form.order),
  name: form.name || '',
});

export default {
  name: 'RoomTagDialog',
  components: {
    ConfirmDialog,
    DialogTargetContext,
    TagListDialog,
    UiField,
  },
  emits: ['close'],
  props: {
    dialogVisible: Boolean,
    roomId: String,
    roomName: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      screen: 'list',
      editingTag: null,
      form: createForm(),
      initialForm: createForm(),
      formTouched: false,
      formSubmitted: false,
      formTriggerElement: null,
      formTriggerPresentation: 'desktop',
      sending: false,
      discardConfirmVisible: false,
      discardClosePending: false,
      discardFocusPending: false,
      deleteConfirmVisible: false,
      deleteSending: false,
      deleteTarget: null,
      deleteFocusRequest: null,
      deleteClosedFocusRequest: null,
      resetConfirmVisible: false,
      resetSending: false,
    };
  },
  computed: {
    tagDialogConfig() {
      return ROOM_TAG_DIALOG_CONFIG;
    },
    editorTitle() {
      return this.editingTag ? this.$t('ルームタグを編集') : this.$t('ルームタグを作成');
    },
    editorSubmitLabel() {
      return this.editingTag ? this.$t('managementUi.save') : this.$t('作成');
    },
    formDirty() {
      const current = normalizedFormValue(this.form);
      const initial = normalizedFormValue(this.initialForm);
      return current.order !== initial.order || current.name !== initial.name;
    },
    nameError() {
      if (!this.formTouched && !this.formSubmitted) return '';
      if (!this.form.name) return this.$t('必須');
      if ([...this.form.name].length > 50) return this.$t('50文字まで');
      return '';
    },
    orderValidation() {
      return normalizeTagOrderInput(this.form.order, {
        min: 1,
        max: 100,
        fallback: 100,
      });
    },
    orderError() {
      if (!this.formSubmitted || this.orderValidation.valid) return '';
      return this.$t('表示順番は1以上、100以下の整数です');
    },
  },
  watch: {
    dialogVisible(value) {
      if (!value) this.resetWorkflowState();
    },
    roomId(nextId, previousId) {
      if (nextId === previousId) return;
      this.resetWorkflowState();
    },
  },
  methods: {
    captureTrigger(event) {
      const target = event?.currentTarget;
      this.formTriggerElement = target && typeof target.focus === 'function' ? target : null;
      this.formTriggerPresentation = target?.id?.includes('_mobile') ? 'mobile' : 'desktop';
    },
    focusForm() {
      this.$nextTick(() => {
        const target = this.editingTag ? this.$refs.nameInput : this.$refs.orderInput;
        if (!target || typeof target.focus !== 'function') return;
        target.focus({ preventScroll: true });
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },
    openCreateEditor(event) {
      if (this.sending) return;
      this.captureTrigger(event);
      this.editingTag = null;
      this.form = createForm();
      this.initialForm = createForm();
      this.formTouched = false;
      this.formSubmitted = false;
      this.screen = 'editor';
      this.focusForm();
    },
    openEditEditor(event, tag) {
      if (this.sending || !tag) return;
      this.captureTrigger(event);
      this.editingTag = tag;
      this.form = createForm(tag);
      this.initialForm = createForm(tag);
      this.formTouched = false;
      this.formSubmitted = false;
      this.screen = 'editor';
      this.focusForm();
    },
    requestCloseEditor() {
      if (this.sending) return;
      if (this.formDirty) {
        this.discardConfirmVisible = true;
        return;
      }
      this.closeEditor();
    },
    closeEditor({ restoreFocus = true } = {}) {
      const trigger = this.formTriggerElement;
      this.screen = 'list';
      this.editingTag = null;
      this.form = createForm();
      this.initialForm = createForm();
      this.formTouched = false;
      this.formSubmitted = false;
      this.formTriggerElement = null;
      if (!restoreFocus) return;
      this.$nextTick(() => {
        if (!trigger?.isConnected || trigger.disabled || typeof trigger.focus !== 'function') return;
        trigger.focus({ preventScroll: true });
      });
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
      this.focusForm();
    },
    validateForm() {
      this.formSubmitted = true;
      this.formTouched = true;
      if (this.nameError || this.orderError) {
        this.$nextTick(() => {
          const target = this.orderError ? this.$refs.orderInput : this.$refs.nameInput;
          if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
        });
        return false;
      }
      return true;
    },
    async saveTag() {
      if (this.sending || !this.validateForm()) return;
      const editingTag = this.editingTag;
      const presentation = this.formTriggerPresentation;
      this.sending = true;
      try {
        const payload = buildTagUpsertPayload({
          scope: 'room',
          scopeId: editingTag ? null : this.roomId,
          tagId: editingTag?._id,
          order: this.orderValidation.value,
          name: this.form.name,
          lang: editingTag?.lang || this.$store.getters.lang,
        });
        const response = editingTag
          ? await tagApi.roomTag.update(payload, { management: false })
          : await tagApi.roomTag.create(payload);
        const savedId = response?.data?._id || editingTag?._id || null;
        this.setMessage(editingTag ? 'ルームタグを更新しました' : 'ルームタグを作成しました');
        this.sending = false;
        this.closeEditor({ restoreFocus: false });
        await this.$refs.tagListDialog.fetchTags({ ignoreExternalSending: true });
        this.$refs.tagListDialog.focusTag(savedId, presentation);
      } catch (error) {
        this.showError(editingTag ? 'ルームタグの更新に失敗しました' : 'ルームタグの作成に失敗しました', error);
      } finally {
        this.sending = false;
      }
    },
    buildDeleteFocusRequest(tag, event) {
      const tags = this.$refs.tagListDialog?.tags || [];
      const index = tags.findIndex((candidate) => candidate._id === tag?._id);
      return {
        candidateIds: [tags[index + 1]?._id, tags[index - 1]?._id].filter(Boolean),
        presentation: event?.currentTarget?.id?.includes('_mobile') ? 'mobile' : 'desktop',
      };
    },
    openDeleteConfirmation(tag, event) {
      if (this.sending || !tag) return;
      this.deleteClosedFocusRequest = null;
      this.deleteTarget = tag;
      this.deleteFocusRequest = this.buildDeleteFocusRequest(tag, event);
      this.deleteConfirmVisible = true;
    },
    closeDeleteConfirmation() {
      if (this.deleteSending || !this.deleteConfirmVisible) return;
      this.deleteConfirmVisible = false;
      this.deleteClosedFocusRequest = null;
    },
    handleDeleteConfirmationClosed() {
      const focusRequest = this.deleteClosedFocusRequest;
      this.deleteTarget = null;
      this.deleteFocusRequest = null;
      this.deleteClosedFocusRequest = null;
      if (!focusRequest) return;
      this.$refs.tagListDialog.focusTag(focusRequest.id, focusRequest.presentation);
    },
    async deleteTag() {
      if (this.deleteSending || !this.deleteTarget) return;
      const target = this.deleteTarget;
      const focusRequest = this.deleteFocusRequest;
      this.deleteSending = true;
      try {
        await tagApi.roomTag.remove(buildTagDeletePayload(target));
        this.setMessage('ルームタグを削除しました');
        await this.$refs.tagListDialog.fetchTags({ ignoreExternalSending: true });
        const currentIds = new Set(this.$refs.tagListDialog.tags.map((tag) => tag._id));
        const focusId = focusRequest?.candidateIds.find((id) => currentIds.has(id)) || null;
        this.deleteClosedFocusRequest = {
          id: focusId,
          presentation: focusRequest?.presentation,
        };
        this.deleteConfirmVisible = false;
      } catch (error) {
        this.showError('ルームタグの削除に失敗しました', error);
      } finally {
        this.deleteSending = false;
      }
    },
    openResetConfirmation() {
      if (this.sending) return;
      this.resetConfirmVisible = true;
    },
    closeResetConfirmation() {
      if (this.resetSending || !this.resetConfirmVisible) return;
      this.resetConfirmVisible = false;
    },
    async resetToFloorTags() {
      if (this.resetSending) return;
      this.resetSending = true;
      try {
        const succeeded = await this.$refs.tagListDialog.performReset({
          ignoreExternalSending: true,
        });
        if (succeeded) this.resetConfirmVisible = false;
      } finally {
        this.resetSending = false;
      }
    },
    resetWorkflowState() {
      this.screen = 'list';
      this.editingTag = null;
      this.form = createForm();
      this.initialForm = createForm();
      this.formTouched = false;
      this.formSubmitted = false;
      this.formTriggerElement = null;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
      this.discardFocusPending = false;
      this.deleteConfirmVisible = false;
      this.deleteTarget = null;
      this.deleteFocusRequest = null;
      this.deleteClosedFocusRequest = null;
      this.resetConfirmVisible = false;
    },
    onClose() {
      this.resetWorkflowState();
      this.$emit('close');
    },
    setMessage(key, role = 'status') {
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
.room-tag-editor {
  display: grid;
  gap: 20px;
  padding-top: 4px;
}

.room-tag-editor input {
  box-sizing: border-box;
  width: 100%;
}

.room-tag-confirm-details {
  display: grid;
  gap: 12px;
}

.room-tag-confirm-details p {
  margin: 0;
}
</style>
