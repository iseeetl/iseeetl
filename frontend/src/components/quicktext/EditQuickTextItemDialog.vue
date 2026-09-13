<template>
  <BaseEditDialog
    class="management-quicktext-edit-dialog"
    :visible="visible"
    :sending="sending"
    title-id="quicktext-item-dialog-title"
    :title-text="$t(propsItem ? '単語編集' : '単語作成')"
    :description-ids="[
      group ? 'quicktext-item-group-context' : '',
      propsItem ? 'quicktext-item-target-context' : '',
    ].filter(Boolean).join(' ')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t(propsItem ? '保存' : '作成')"
    cancel-test-id="quicktext-dialog-cancel"
    confirm-test-id="quicktext-dialog-submit"
    actions-adjacent
    initial-focus="#qt_item_label"
    progress-mode="indeterminate"
    @update:visible="visible = $event"
    @cancel="onCancel"
    @confirm="onDone"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <div class="quicktext-dialog-contexts">
      <DialogTargetContext
        v-if="group"
        context-id="quicktext-item-group-context"
        :label="$t('単語グループ名')"
        :name="group.title || ''"
      />
      <DialogTargetContext
        v-if="propsItem"
        context-id="quicktext-item-target-context"
        :label="$t('名称')"
        :name="targetName"
      />
    </div>

    <div class="edit-input-field">
      <UiField
        control-id="qt_item_label"
        counter
        :label="`${$t('名称')} ${$t('200文字まで')} ${$t('必須')}`"
        :invalid="labelInvalid"
        :error="labelError"
      >
        <template #default="{ controlAttrs }">
          <input
            v-bind="controlAttrs"
            maxlength="200"
            v-model="label"
            dir="auto"
            :disabled="sending"
            aria-required="true"
            required
            @blur="v$.label.$touch()"
          />
        </template>
      </UiField>
    </div>

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
</template>

<script>
import { createQuickTextItemDialogComponent } from '@/components/quicktext/quickTextDialogFactory';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

const component = createQuickTextItemDialogComponent({
  name: 'EditQuickTextItemDialog',
  resource: 'management',
  errorWrapper: 'paren',
  confirmDiscard: true,
});

component.components = {
  ...component.components,
  ConfirmDialog,
};

export default component;
</script>

<style scoped>
.edit-input-field {
  margin-bottom: 12px;
}

.quicktext-dialog-contexts {
  display: grid;
  gap: 8px;
}

</style>
