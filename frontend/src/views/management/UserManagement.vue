<template>
  <ManagementListBase
    ref="listBase"
    :title="$t('ユーザ管理')"
    :table-label="$t('managementUi.tableLabel', { resource: $t('ユーザ') })"
    :fetcher="getUsers"
    :errorMessage="$t('managementUi.loadResourceFailed', { resource: $t('ユーザ') })"
    :payload-builder="buildListPayload"
    :searchEnabled="true"
    :searchMinLength="2"
    :searchMaxLength="20"
    :searchMinErrorText="$t('2文字以上です')"
    :searchMaxErrorText="$t('20文字まで')"
  >
    <template #filters="{ fetching }">
      <ManagementStatusFilter
        v-model="statusFilter"
        :disabled="sending || fetching"
        @change="onStatusFilterChange"
      />
    </template>

    <template #table="{ items, tableAttrs }">
      <div class="management-table-scroll">
        <table v-bind="tableAttrs" class="management-table management-table--wide">
          <thead>
            <tr>
              <th scope="col">{{ $t('ユーザ名') }}</th>
              <th scope="col">{{ $t('メール') }}</th>
              <th scope="col">{{ $t('権限') }}</th>
              <th scope="col">{{ $t('managementUi.status') }}</th>
              <th scope="col">{{ $t('作成日') }}</th>
              <th scope="col">{{ $t('更新日') }}</th>
              <th scope="col">{{ $t('削除日') }}</th>
              <th scope="col">{{ $t('managementUi.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in items" :key="user._id" :class="{ 'soft-delete': user.delete_flg }">
              <td :data-label="$t('ユーザ名')" dir="auto">{{ resolveUserDisplayName(user) }}</td>
              <td :data-label="$t('メール')" dir="ltr">{{ user.mail || '—' }}</td>
              <td :data-label="$t('権限')">{{ showRoleLabel(user.role) || '—' }}</td>
              <td :data-label="$t('managementUi.status')">
                <ManagementStatusBadge
                  :label="$t(user.delete_flg ? 'managementUi.statusDeleted' : 'managementUi.statusActive')"
                  :tone="user.delete_flg ? 'danger' : 'success'"
                />
              </td>
              <td :data-label="$t('作成日')">
                <span v-text="formatManagementDate(user.created_at) || '—'"></span>
              </td>
              <td :data-label="$t('更新日')">
                <span v-text="formatManagementDate(user.updated_at) || '—'"></span>
              </td>
              <td :data-label="$t('削除日')">
                <span v-text="formatManagementDate(user.deleted_at) || '—'"></span>
              </td>
              <td :data-label="$t('managementUi.actions')">
                <div class="management-row-actions">
                  <UiButton
                    v-if="user.role !== 'Administrator'"
                    data-testid="management-user-lifecycle"
                    :data-management-lifecycle-id="user._id"
                    class="management-row-action-button"
                    appearance="filled"
                    :tone="user.delete_flg ? 'primary' : 'danger'"
                    :disabled="sending"
                    :aria-label="rowActionLabel(user.delete_flg ? 'restore' : 'delete', user)"
                    @click="showLifecycleDialog(user)"
                  >
                    {{ $t(user.delete_flg ? 'managementUi.restore' : 'managementUi.delete') }}
                  </UiButton>
                  <UiButton
                    v-if="!user.delete_flg"
                    data-testid="management-user-edit"
                    class="management-row-action-button"
                    appearance="filled"
                    tone="primary"
                    :disabled="sending"
                    :aria-label="rowActionLabel('edit', user)"
                    @click="showEditUserDialog(user)"
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
        class="user-management-form-dialog"
        :visible="editUserValue.dialogVisible"
        :sending="sending"
        title-id="user-management-edit-dialog-title"
        :title-text="$t('ユーザ編集')"
        description-ids="user-management-target-context"
        :cancel-label="$t('キャンセル')"
        :confirm-label="$t('managementUi.save')"
        confirm-test-id="management-user-submit"
        actions-adjacent
        initial-focus="#user-management-username"
        progress-mode="indeterminate"
        @update:visible="editUserValue.dialogVisible = $event"
        @cancel="requestCloseEditUserDialog"
        @closed="handleEditUserDialogClosed"
        @confirm="editUser"
      >
        <DialogTargetContext
          context-id="user-management-target-context"
          :label="$t('対象ユーザ')"
          :name="selectedUserName"
        />

        <UiField
          v-slot="{ controlAttrs }"
          control-id="user-management-username"
          :label="$t('ユーザ名')"
          :invalid="v$.editUserValue.username.$dirty && v$.editUserValue.username.$invalid"
          :error="usernameError"
        >
          <input
            v-bind="controlAttrs"
            v-model="editUserValue.username"
            maxlength="20"
            :disabled="sending"
            @blur="v$.editUserValue.username.$touch()"
          />
        </UiField>

        <UiField
          v-slot="{ controlAttrs }"
          control-id="user-management-mail"
          :label="$t('メール')"
          :invalid="v$.editUserValue.mail.$dirty && v$.editUserValue.mail.$invalid"
          :error="mailError"
        >
          <input
            v-bind="controlAttrs"
            v-model="editUserValue.mail"
            type="email"
            :disabled="sending"
            @blur="v$.editUserValue.mail.$touch()"
          />
        </UiField>

        <UiField
          v-slot="{ controlAttrs }"
          control-id="password"
          :label="$t('新しいパスワード')"
          :description="$t('変更しない場合は空欄（8〜16文字）')"
          :invalid="v$.editUserValue.password.$dirty && v$.editUserValue.password.$invalid"
          :error="passwordError"
        >
          <input
            v-bind="controlAttrs"
            v-model.trim="editUserValue.password"
            type="password"
            maxlength="16"
            :disabled="sending"
            @blur="v$.editUserValue.password.$touch()"
          />
        </UiField>

        <UiField v-slot="{ controlAttrs }" control-id="role" :label="$t('権限')">
          <input
            v-if="isEditingAdministrator"
            v-bind="controlAttrs"
            :value="showRoleLabel(editUserValue.role)"
            disabled
          />
          <select v-else v-bind="controlAttrs" v-model="editUserValue.role" :disabled="sending" required>
            <option value="Author">{{ $t('投稿者') }}</option>
            <option value="Editor">{{ $t('フロア編集者') }}</option>
            <option value="developer">{{ $t('開発者') }}</option>
          </select>
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
        :action="lifecycleAction"
        :resource-label="$t('ユーザ')"
        :resource-name="resolveUserDisplayName(lifecycleTarget)"
        @confirm="setDeleteState"
        @cancel="clearLifecycleDialog"
        @request-close="clearLifecycleDialog"
        @closed="handleLifecycleDialogClosed"
      />
    </template>
  </ManagementListBase>
</template>

<script>
import userApi from '@/api/user';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength, email } from '@vuelidate/validators';
import ManagementListBase from '@/components/management/ManagementListBase.vue';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';
import ManagementStatusBadge from '@/components/management/ManagementStatusBadge.vue';
import ManagementStatusFilter from '@/components/management/ManagementStatusFilter.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import { createManagementDateFormatterMethods } from '@/utils/managementDateFormat';
import { withDeleteFilter } from '@/features/management/lifecycle';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

const requiredWhenNotNull = (value) => value === null || required.$validator(value);

export default {
  name: 'UserManagement',
  components: {
    ManagementListBase,
    ManagementLifecycleDialog,
    ManagementStatusBadge,
    ManagementStatusFilter,
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
      editUserValue: {
        dialogVisible: false,
        _id: null,
        username: null,
        mail: null,
        password: null,
        role: null,
        image_name: null,
        delete_flg: null,
      },

      sending: false,
      selectedUserName: '',
      initialUserForm: null,
      discardConfirmVisible: false,
      discardClosePending: false,
      statusFilter: 'all',
      lifecycleDialogVisible: false,
      lifecycleTarget: null,
      lifecycleFocusRequest: null,
      lifecycleFocusAfterMutation: false,
    };
  },
  computed: {
    isEditingAdministrator() {
      return this.editUserValue.role === 'Administrator';
    },
    lifecycleAction() {
      return this.lifecycleTarget?.delete_flg ? 'restore' : 'delete';
    },
    editUserFormDirty() {
      if (!this.initialUserForm) return false;
      return JSON.stringify(this.userFormSnapshot()) !== JSON.stringify(this.initialUserForm);
    },
    usernameError() {
      const field = this.v$.editUserValue.username;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('必須です');
      if (field.minLength.$invalid) return this.$t('2文字以上です');
      if (field.maxLength.$invalid) return this.$t('20文字まで');
      return '';
    },
    mailError() {
      const field = this.v$.editUserValue.mail;
      if (!field.$dirty) return '';
      if (field.requiredWhenNotNull.$invalid) return this.$t('必須です');
      if (field.email.$invalid) return this.$t('メール形式ではありません');
      return '';
    },
    passwordError() {
      const field = this.v$.editUserValue.password;
      if (!field.$dirty) return '';
      if (field.minLength.$invalid) return this.$t('8文字以上');
      if (field.maxLength.$invalid) return this.$t('16文字まで');
      return '';
    },
  },
  validations: {
    editUserValue: {
      username: {
        required,
        minLength: minLength(2),
        maxLength: maxLength(20),
      },
      mail: {
        requiredWhenNotNull,
        email,
      },
      password: {
        minLength: minLength(8),
        maxLength: maxLength(16),
      },
    },
  },
  methods: {
    ...userDisplayMethods,
    ...createManagementDateFormatterMethods(),
    showRoleLabel(role) {
      let result = null;
      if (role === 'Author') result = this.$t('投稿者');
      if (role === 'Editor') result = this.$t('フロア編集者');
      if (role === 'developer') result = this.$t('開発者');
      if (role === 'Administrator') result = this.$t('管理者');
      return result;
    },

    getUsers(payload) {
      return userApi.managementPaginate(payload);
    },
    buildListPayload({ page, search }) {
      return withDeleteFilter({ page, search }, this.statusFilter);
    },
    onStatusFilterChange(value) {
      this.statusFilter = value;
      return this.$refs.listBase.reloadFromFirstPage();
    },
    rowActionLabel(action, user) {
      return `${this.$t(`managementUi.${action}`)}: ${this.$t('ユーザ')}「${this.resolveUserDisplayName(user)}」`;
    },

    showEditUserDialog(user) {
      if (this.sending || user.delete_flg) return;
      this.editUserValue.dialogVisible = true;
      this.editUserValue._id = user._id;
      this.editUserValue.username = this.resolveUserDisplayName(user);
      this.editUserValue.mail = user.mail;
      this.editUserValue.role = user.role;
      this.editUserValue.image_name = this.resolveUserDisplayImageName(user);
      this.editUserValue.delete_flg = user.delete_flg;
      this.selectedUserName = this.resolveUserDisplayName(user);
      this.initialUserForm = this.userFormSnapshot();
    },
    showLifecycleDialog(user) {
      if (this.sending || !user || user.role === 'Administrator') return;
      this.lifecycleFocusRequest =
        this.$refs.listBase?.createLifecycleFocusRequest?.(user._id) || { candidateIds: [] };
      this.lifecycleFocusAfterMutation = false;
      this.lifecycleTarget = user;
      this.lifecycleDialogVisible = true;
    },
    async setDeleteState(action = this.lifecycleAction) {
      if (this.sending || !this.lifecycleTarget) return;
      this.sending = true;
      try {
        await userApi.managementSetDeleteState({
          _id: this.lifecycleTarget._id,
          delete_flg: action === 'delete',
        });
      } catch (error) {
        this.$refs.listBase.showError(
          this.$t(action === 'delete' ? '削除に失敗しました' : '復元に失敗しました'),
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
    async editUser() {
      this.v$.editUserValue.$touch();
      if (this.v$.editUserValue.$invalid) return;

      if (this.sending) return;
      this.sending = true;
      const data = { _id: this.editUserValue._id };
      if (this.editUserValue.username !== null) data['username'] = this.editUserValue.username;
      data['mail'] = this.editUserValue.mail;
      if (this.editUserValue.password) data['password'] = this.editUserValue.password;
      if (this.editUserValue.role !== null) data['role'] = this.editUserValue.role;
      if (this.editUserValue.image_name !== null) data['image_name'] = this.editUserValue.image_name;
      if (this.editUserValue.delete_flg !== null) data['delete_flg'] = this.editUserValue.delete_flg;
      try {
        await userApi.managementUpdate(data);
      } catch (e) {
        this.sending = false;
        this.$refs.listBase.showError(this.$t('更新に失敗しました'), e);
        return;
      }

      if (
        data._id != null &&
        this.$store.getters.userId != null &&
        String(data._id) === String(this.$store.getters.userId)
      ) {
        await this.$store.dispatch('doUpdateUserIdentity', {
          name: data.username ?? this.$store.getters.userName,
          imageName: Object.prototype.hasOwnProperty.call(data, 'image_name')
            ? data.image_name
            : this.$store.getters.userImageName,
        });
      }

      try {
        await this.$refs.listBase.reload();
      } catch {
        // 一覧の再取得で発生したエラーの表示は、ManagementListBaseに任せる。
      }
      this.sending = false;
      this.closeEditUserDialog();
    },
    userFormSnapshot() {
      return {
        username: this.editUserValue.username || '',
        mail: this.editUserValue.mail || '',
        password: this.editUserValue.password || '',
        role: this.editUserValue.role || '',
      };
    },
    requestCloseEditUserDialog() {
      if (this.sending) return;
      if (this.editUserFormDirty) {
        this.discardClosePending = false;
        this.discardConfirmVisible = true;
        return;
      }
      this.closeEditUserDialog();
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
      this.closeEditUserDialog();
    },
    closeEditUserDialog() {
      if (this.sending) return;
      this.editUserValue.dialogVisible = false;
    },
    handleEditUserDialogClosed() {
      this.clearEditUserValue();
    },
    clearEditUserValue() {
      if (this.sending) return;
      this.v$.$reset();
      this.editUserValue.dialogVisible = false;
      this.editUserValue._id = null;
      this.editUserValue.username = null;
      this.editUserValue.mail = null;
      this.editUserValue.password = null;
      this.editUserValue.role = null;
      this.editUserValue.image_name = null;
      this.editUserValue.delete_flg = false;
      this.selectedUserName = '';
      this.initialUserForm = null;
      this.discardConfirmVisible = false;
      this.discardClosePending = false;
    },
  },
};
</script>

<style scoped>
:global(.user-management-form-dialog) {
  --ui-dialog-width: 600px;
}
</style>
