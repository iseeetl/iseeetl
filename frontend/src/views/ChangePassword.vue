<template>
  <div>
    <div class="view">
      <div class="view-header">
        <BackButton :to="profileReturnTo" label="プロフィールへ戻る" :after-navigate="passwordChangeNavigation?.reopenProfile" />
        <h1 class="view-title">
          {{ $t('パスワード変更') }}
        </h1>
      </div>

      <div class="view-content">
        <p>{{ $t('現在のパスワードと新しいパスワードを入力してください') }}</p>

        <router-link v-if="mailDeliveryAvailable" :to="{ name: 'SendResetPasswordLink', query: { from: 'ChangePassword' } }" class="text-link">
          {{ $t('※現在のパスワードが分からない場合にはこちら') }}
        </router-link>

        <div>
          <UiField
            class="password-field"
            control-id="old-password"
            :label="$t('現在のパスワード')"
            :invalid="v$.oldPassword.$dirty && v$.oldPassword.$invalid"
            :error="validationPasswordError('oldPassword')"
          >
            <template #default="{ controlAttrs }">
              <span role="status" class="text-count">{{ oldPassword.length }} / 16</span>
              <input
                v-bind="controlAttrs"
                v-model.trim="oldPassword"
                :type="oldPasswordFieldType"
                maxlength="16"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.oldPassword.$touch()"
              />
              <UiButton
                class="password-button"
                icon-only
                :aria-label="$t('パスワードを表示/非表示にするボタン')"
                :disabled="sending"
                @click.stop="toggleOldPasswordVisibility"
              >
                <UiIcon :name="oldPasswordVisibilityIcon" />
              </UiButton>
            </template>
          </UiField>

          <UiField
            class="password-field"
            control-id="new-password"
            :label="`${$t('新しいパスワード')} ${$t('8文字以上')} ${$t('16文字まで')}`"
            :invalid="v$.newPassword.$dirty && v$.newPassword.$invalid"
            :error="validationPasswordError('newPassword')"
          >
            <template #default="{ controlAttrs }">
              <span role="status" class="text-count">{{ newPassword.length }} / 16</span>
              <input
                v-bind="controlAttrs"
                v-model.trim="newPassword"
                :type="newPasswordFieldType"
                maxlength="16"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.newPassword.$touch()"
              />
              <UiButton
                class="password-button"
                icon-only
                :aria-label="$t('パスワードを表示/非表示にするボタン')"
                :disabled="sending"
                @click.stop="toggleNewPasswordVisibility"
              >
                <UiIcon :name="newPasswordVisibilityIcon" />
              </UiButton>
            </template>
          </UiField>

          <UiField
            class="password-field"
            control-id="confirm-password"
            :label="$t('新しいパスワード確認')"
            :invalid="v$.confirmPassword.$dirty && v$.confirmPassword.$invalid"
            :error="validationConfirmPasswordError()"
          >
            <template #default="{ controlAttrs }">
              <span role="status" class="text-count">{{ confirmPassword.length }} / 16</span>
              <input
                v-bind="controlAttrs"
                v-model.trim="confirmPassword"
                :type="confirmPasswordFieldType"
                maxlength="16"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.confirmPassword.$touch()"
              />
              <UiButton
                class="password-button"
                icon-only
                :aria-label="$t('パスワードを表示/非表示にするボタン')"
                :disabled="sending"
                @click.stop="toggleConfirmPasswordVisibility"
              >
                <UiIcon :name="confirmPasswordVisibilityIcon" />
              </UiButton>
            </template>
          </UiField>

          <div class="right-button-wrapper">
            <UiButton
              class="right-button"
              data-testid="account-submit"
              appearance="filled"
              tone="primary"
              :disabled="sending"
              @click.stop="changePassword"
            >
              {{ $t('設定') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import userApi from '@/api/user';
import { appendApiErrorMessage } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength, sameAs } from '@vuelidate/validators';

import BackButton from '@/components/common/BackButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  name: 'ChangePassword',
  inject: {
    passwordChangeNavigation: { default: null },
  },
  components: {
    BackButton,
    UiButton,
    UiField,
    UiIcon,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      oldPassword: '',
      oldPasswordFieldType: 'password',
      oldPasswordVisibilityIcon: 'visibility',

      newPassword: '',
      newPasswordFieldType: 'password',
      newPasswordVisibilityIcon: 'visibility',

      confirmPassword: '',
      confirmPasswordFieldType: 'password',
      confirmPasswordVisibilityIcon: 'visibility',

      sending: false,
    };
  },
  computed: {
    profileReturnTo() {
      return this.passwordChangeNavigation?.getReturnTo() || { name: 'Floor' };
    },
    mailDeliveryAvailable() {
      return this.$store.getters.mailDeliveryAvailable;
    },
  },
  validations() {
    return {
      oldPassword: {
        required,
        minLength: minLength(8),
        maxLength: maxLength(16),
      },
      newPassword: {
        required,
        minLength: minLength(8),
        maxLength: maxLength(16),
      },
      confirmPassword: {
        required,
        minLength: minLength(8),
        maxLength: maxLength(16),
        sameAs: sameAs(this.newPassword),
      },
    };
  },
  methods: {
    toggleOldPasswordVisibility() {
      if (this.oldPasswordFieldType === 'password') {
        this.oldPasswordFieldType = 'text';
        this.oldPasswordVisibilityIcon = 'visibility_off';
      } else {
        this.oldPasswordFieldType = 'password';
        this.oldPasswordVisibilityIcon = 'visibility';
      }
    },
    toggleNewPasswordVisibility() {
      if (this.newPasswordFieldType === 'password') {
        this.newPasswordFieldType = 'text';
        this.newPasswordVisibilityIcon = 'visibility_off';
      } else {
        this.newPasswordFieldType = 'password';
        this.newPasswordVisibilityIcon = 'visibility';
      }
    },
    toggleConfirmPasswordVisibility() {
      if (this.confirmPasswordFieldType === 'password') {
        this.confirmPasswordFieldType = 'text';
        this.confirmPasswordVisibilityIcon = 'visibility_off';
      } else {
        this.confirmPasswordFieldType = 'password';
        this.confirmPasswordVisibilityIcon = 'visibility';
      }
    },

    validationPasswordError(fieldName) {
      const field = this.v$[fieldName];
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('パスワードの入力は必須です');
      if (field.minLength.$invalid || field.maxLength.$invalid) {
        return this.$t('パスワードは8文字以上16文字以内にしてください');
      }
      return '';
    },
    validationConfirmPasswordError() {
      const field = this.v$.confirmPassword;
      const rangeError = this.validationPasswordError('confirmPassword');
      if (rangeError) return rangeError;
      if (field.$dirty && field.sameAs.$invalid) return this.$t('新しいパスワードと一致しません');
      return '';
    },

    async changePassword() {
      this.v$.$touch();
      if (this.v$.$invalid) return;

      if (this.sending) return;
      this.sending = true;

      const data = {
        old_password: this.oldPassword,
        new_password: this.newPassword,
      };

      try {
        await userApi.changePassword(data);
        await this.$store.dispatch('doLogout');
        await this.$router.push({ name: 'Login' });

        this.setSnackbar(this.$t('パスワードを変更しました'), 'status');

        this.v$.$reset();
        this.oldPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('パスワード変更に失敗しました'), err, { translate: this.$t });
        this.setSnackbar(message, 'alert');
      } finally {
        this.sending = false;
      }
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
  },
};
</script>

<style scoped>
.password-button {
  position: absolute;
  top: 2px;
  inset-inline-end: 0;
  margin: 0 4px;
}
.password-field input {
  padding-inline-end: 48px;
}
.password-field .text-count {
  inset-inline-end: 48px;
}
</style>
