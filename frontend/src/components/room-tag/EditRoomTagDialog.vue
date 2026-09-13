<template>
  <BaseEditDialog
    ref="dialogRootRef"
    v-model:visible="visible"
    :sending="sending"
    title-id="edit_room_tag_dialog_title"
    :title-text="managementMode ? $t('ルームタグを編集') : $t('ルームタグ編集')"
    :description-ids="dialogDescriptionIds"
    :cancel-label="$t('キャンセル')"
    :confirm-label="managementMode ? $t('managementUi.save') : $t('OK')"
    :progress-amount="progressAmount"
    :actions-adjacent="managementMode"
    initial-focus="#room_tag_order"
    @opened="openedDialog"
    @closed="closedDialog"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
  >
    <div v-if="managementMode" class="management-tag-targets">
      <DialogTargetContext
        context-id="edit-room-tag-floor-context"
        :label="$t('対象フロア')"
        :name="resolvedFloorName"
      />
      <DialogTargetContext
        context-id="edit-room-tag-room-context"
        :label="$t('対象ルーム')"
        :name="resolvedRoomName"
      />
      <DialogTargetContext
        context-id="edit-room-tag-tag-context"
        :label="$t('対象タグ')"
        :name="resolvedTagName"
      />
    </div>

    <div class="edit-input-field">
      <UiField control-id="room_tag_order" :label="$t('表示順番（1以上 100以下）')">
        <template #default="{ controlAttrs }">
          <input
            v-bind="controlAttrs"
            v-model="order"
            type="number"
            autocomplete="off"
            min="1"
            max="100"
            :disabled="sending"
          />
        </template>
      </UiField>
    </div>

    <div class="edit-input-field">
      <UiField
        control-id="room_tag_name"
        counter
        :label="`${$t('タグ名')} ${$t('必須')} ${$t('50文字まで')}`"
        :invalid="v$.name.$dirty && v$.name.$invalid"
        :error="nameError"
      >
        <template #default="{ controlAttrs }">
          <input
            v-bind="controlAttrs"
            v-model="name"
            dir="auto"
            maxlength="50"
            :disabled="sending"
            aria-required="true"
            required
            @blur="v$.name.$touch()"
          />
        </template>
      </UiField>
    </div>

    <div v-if="managementMode && showLifecycleControl" class="edit-input-field">
      <input id="delete_flg" class="checkbox-input" type="checkbox" v-model="delete_flg" :disabled="sending" />
      <label class="checkbox-label" for="delete_flg">
        {{ $t('論理削除') }}
      </label>
    </div>
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
</template>

<script>
import tagApi from '@/api/tag';
import { appendApiErrorMessage } from '@/api/apiClient';
import { buildTagUpsertPayload, normalizeTagOrderInput } from '@/features/tag/shared/tagCore';
import { runWithSendingAndProgress } from '@/features/tag/shared/tagAsync';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiField from '@/components/ui/UiField.vue';

export default {
  emits: ['close', 'success'],
  name: 'EditRoomTagDialog',
  components: {
    BaseEditDialog,
    ConfirmDialog,
    DialogTargetContext,
    UiField,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  props: {
    dialogVisible: Boolean,
    roomId: String,
    roomTag: Object,
    managementMode: Boolean,
    floorName: {
      type: String,
      default: '',
    },
    roomName: {
      type: String,
      default: '',
    },
    tagName: {
      type: String,
      default: '',
    },
    showLifecycleControl: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      order: null,
      name: null,
      delete_flg: false,

      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
      initialForm: null,
      discardConfirmVisible: false,
      discardClosePending: false,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  validations: {
    name: {
      required,
      maxLength: maxLength(50),
    },
  },
  computed: {
    resolvedFloorName() {
      return this.floorName || this.roomTag?.floor?.title || '-';
    },
    resolvedRoomName() {
      return this.roomName || this.roomTag?.room?.title || '-';
    },
    resolvedTagName() {
      return this.tagName || this.roomTag?.name || '-';
    },
    dialogDescriptionIds() {
      if (!this.managementMode) return '';
      return 'edit-room-tag-floor-context edit-room-tag-room-context edit-room-tag-tag-context';
    },
    formDirty() {
      if (!this.initialForm) return false;
      return (
        this.normalizedOrder(this.order) !== this.initialForm.order ||
        (this.name || '') !== this.initialForm.name
      );
    },
    nameError() {
      const field = this.v$.name;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('必須');
      if (field.maxLength.$invalid) return this.$t('50文字まで');
      return '';
    },
  },
  methods: {
    openedDialog() {
      if (this.roomTag !== null) {
        this.order = this.roomTag.order;
        this.name = this.roomTag.name;
        this.delete_flg = this.roomTag.delete_flg;
      }
      this.captureInitialForm();
    },

    onPressCancelButton() {
      if (this.sending) return;
      if (this.managementMode && this.formDirty) {
        this.discardConfirmVisible = true;
        return;
      }
      this.visible = false;
    },

    normalizedOrder(value) {
      return value === null || value === undefined ? '' : String(value);
    },

    captureInitialForm() {
      this.initialForm = {
        order: this.normalizedOrder(this.order),
        name: this.name || '',
      };
    },

    confirmDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardClosePending = true;
      this.discardConfirmVisible = false;
    },

    cancelDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardClosePending = false;
      this.discardConfirmVisible = false;
    },

    handleDiscardConfirmationClosed() {
      if (!this.discardClosePending) return;
      this.discardClosePending = false;
      this.visible = false;
    },

    onPressDoneButton() {
      if (this.sending) return;
      this.v$.$touch();
      if (this.v$.$invalid) return;

      const normalizedOrder = normalizeTagOrderInput(this.order, {
        min: 1,
        max: 100,
        fallback: 100,
      });
      if (!normalizedOrder.valid) {
        this.setSnackbar(this.$t('表示順番は1以上、100以下の整数です'), 'alert');
        return;
      }
      this.order = normalizedOrder.value;
      if (this.managementMode && !this.roomTag?._id) return;

      if (this.roomTag) {
        this.update();
      } else {
        this.create();
      }
    },

    async create() {
      if (this.sending) return;

      try {
        const data = buildTagUpsertPayload({
          scope: 'room',
          scopeId: this.roomId,
          order: this.order,
          name: this.name,
          lang: this.$store.getters.lang,
        });
        await runWithSendingAndProgress({
          setSending: (value) => {
            this.sending = value;
          },
          setProgress: (value) => {
            this.progressAmount = value;
          },
          task: ({ onProgress }) => tagApi.roomTag.create(data, { onUploadProgress: onProgress }),
        });

        this.setSnackbar(this.$t('ルームタグを作成しました'), 'status');
        this.clearValue();
        this.$emit('success');
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('ルームタグの作成に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');
        if (this.handleAuthError(err)) return;
      }
    },

    async update() {
      if (this.sending) return;

      try {
        const data = buildTagUpsertPayload({
          scope: 'room',
          scopeId: null,
          tagId: this.roomTag._id,
          order: this.order,
          name: this.name,
          lang: this.roomTag.lang || this.$store.getters.lang,
          managementMode: this.managementMode,
          deleteFlg: this.delete_flg,
        });
        const roomTagRes = await runWithSendingAndProgress({
          setSending: (value) => {
            this.sending = value;
          },
          setProgress: (value) => {
            this.progressAmount = value;
          },
          task: ({ onProgress }) =>
            tagApi.roomTag.update(data, { management: this.managementMode }, { onUploadProgress: onProgress }),
        });

        this.setSnackbar(this.$t('ルームタグを更新しました'), 'status');
        this.clearValue();
        this.$emit('success', roomTagRes.data);
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('ルームタグの更新に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');
        if (this.handleAuthError(err)) return;
      }
    },

    clearValue() {
      this.v$.$reset();
      this.order = null;
      this.name = null;
      this.delete_flg = false;
      this.initialForm = null;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
    },

    closedDialog() {
      this.clearValue();
      if (!this.sending) {
        this.$emit('close');
      }
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },

    handleAuthError(err) {
      return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
.management-tag-targets {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}
</style>
