<template>
  <BaseEditDialog
    class="management-quicktext-edit-dialog"
    :visible="visible"
    :sending="sending"
    title-id="quicktext-group-dialog-title"
    :title-text="$t(propsGroup ? '単語グループ編集' : '単語グループ作成')"
    :description-ids="propsGroup ? 'quicktext-group-target-context' : ''"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t(propsGroup ? '保存' : '作成')"
    cancel-test-id="quicktext-dialog-cancel"
    confirm-test-id="quicktext-dialog-submit"
    actions-adjacent
    initial-focus="#qt_group_title"
    progress-mode="indeterminate"
    @update:visible="visible = $event"
    @cancel="onCancel"
    @confirm="onDone"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <DialogTargetContext
      v-if="propsGroup"
      context-id="quicktext-group-target-context"
      :label="$t('単語グループ名')"
      :name="targetName"
    />

    <div class="edit-input-field">
      <UiField
        control-id="qt_group_title"
        counter
        :label="`${$t('タイトル')} ${$t('200文字まで')} ${$t('必須')}`"
        :invalid="titleInvalid"
        :error="titleError"
      >
        <template #default="{ controlAttrs }">
          <input
            v-bind="controlAttrs"
            maxlength="200"
            v-model="title"
            dir="auto"
            :disabled="sending"
            aria-required="true"
            required
            @blur="v$.title.$touch()"
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
import { createQuickTextGroupDialogComponent } from '@/components/quicktext/quickTextDialogFactory';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

const component = createQuickTextGroupDialogComponent({
  name: 'EditQuickTextGroupDialog',
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

</style>
