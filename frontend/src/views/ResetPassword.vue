<template>
  <div>
    <div class="view">
      <div class="view-header">
        <BackButton :to="{ name: 'Login' }" label="ログインページへ戻る" />
        <h1 class="view-title">
          {{ $t('パスワード再設定') }}
        </h1>
      </div>

      <div class="view-content" :aria-busy="sending ? 'true' : 'false'">
        <div v-if="sending && !isTokenSuccess" role="status" aria-live="polite">
          <p>
            {{ $t('読み込み中です') }}
          </p>
        </div>

        <div v-else-if="isTokenError" role="alert" aria-live="assertive">
          <p>
            {{
              $t(
                'パスワード再設定リンクが正しくないか、有効期限が切れています。新しいリンクを発行してください。'
              )
            }}
          </p>
          <UiButton data-testid="token-retry" @click.stop="verifyPasswordResetToken">
            {{ $t('再試行') }}
          </UiButton>
          <router-link :to="{ name: 'Login' }" class="text-link">
            {{ $t('ログインページへ') }}
          </router-link>
        </div>

        <div v-else-if="isPasswordResetSuccess" role="status" aria-live="polite">
          <p>
            {{ $t('パスワードを再設定しました') }}
          </p>
          <router-link :to="{ name: 'Login' }" class="text-link">
            {{ $t('ログインページへ') }}
          </router-link>
        </div>

        <div v-else-if="isTokenSuccess">
          <UiField
            class="password-field"
            control-id="password"
            counter
            :label="`${$t('パスワード')} ${$t('8文字以上')} ${$t('16文字まで')}`"
            :invalid="v$.password.$dirty && v$.password.$invalid"
            :error="validationPasswordError()"
          >
            <template #default="{ controlAttrs }">
              <input
                v-bind="controlAttrs"
                v-model.trim="password"
                :type="passwordFieldType"
                maxlength="16"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.password.$touch()"
              />
              <UiButton
                class="password-button"
                icon-only
                :aria-label="$t('パスワードを表示/非表示にするボタン')"
                :disabled="sending"
                @click.stop="togglePasswordVisibility"
              >
                <UiIcon :name="passwordVisibilityIcon" />
              </UiButton>
            </template>
          </UiField>

          <UiField
            class="password-field"
            control-id="confirm-password"
            counter
            :label="$t('パスワード確認')"
            :invalid="v$.confirmPassword.$dirty && v$.confirmPassword.$invalid"
            :error="validationConfirmPasswordError()"
          >
            <template #default="{ controlAttrs }">
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
              @click.stop="resetPassword"
            >
              {{ $t('再設定') }}
            </UiButton>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
import authApi from '@/api/auth';
import { appendApiErrorMessage } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength, sameAs } from '@vuelidate/validators';

import BackButton from '@/components/common/BackButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  name: 'ResetPassword',
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
      password: null,
      passwordFieldType: 'password',
      passwordVisibilityIcon: 'visibility',
      confirmPassword: null,
      confirmPasswordFieldType: 'password',
      confirmPasswordVisibilityIcon: 'visibility',
      isTokenSuccess: false,
      isTokenError: false,
      isPasswordResetSuccess: false,
      sending: false,
    };
  },
  validations() {
    return {
      password: {
        required,
        minLength: minLength(8),
        maxLength: maxLength(16),
      },
      confirmPassword: {
        required,
        minLength: minLength(8),
        maxLength: maxLength(16),
        sameAs: sameAs(this.password),
      },
    };
  },
  async created() {
    try {
      await this.verifyPasswordResetToken();
    } catch (err) {
      const message = appendApiErrorMessage(this.$t('エラーが発生しました'), err, { translate: this.$t });
      this.setSnackbar(message, 'alert');
    }
  },
  methods: {
    togglePasswordVisibility() {
      this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
      this.passwordVisibilityIcon = this.passwordFieldType === 'password' ? 'visibility' : 'visibility_off';
    },
    toggleConfirmPasswordVisibility() {
      this.confirmPasswordFieldType = this.confirmPasswordFieldType === 'password' ? 'text' : 'password';
      this.confirmPasswordVisibilityIcon =
        this.confirmPasswordFieldType === 'password' ? 'visibility' : 'visibility_off';
    },
    validationPasswordError() {
      const field = this.v$.password;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('パスワードの入力は必須です');
      if (field.minLength.$invalid || field.maxLength.$invalid) {
        return this.$t('パスワードは8文字以上16文字以内にしてください');
      }
      return '';
    },
    validationConfirmPasswordError() {
      const field = this.v$.confirmPassword;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('パスワードの入力は必須です');
      if (field.minLength.$invalid || field.maxLength.$invalid) {
        return this.$t('パスワードは8文字以上16文字以内にしてください');
      }
      if (field.sameAs.$invalid) return this.$t('パスワードと一致しません');
      return '';
    },

    async verifyPasswordResetToken() {
      if (this.sending) return;
      this.isTokenSuccess = false;
      this.isTokenError = false;
      this.sending = true;

      try {
        await authApi.verifyResetPasswordToken({ token: this.$route.params.reset_token });
        this.isTokenSuccess = true;
      } catch {
        this.isTokenError = true;
      } finally {
        this.sending = false;
      }
    },

    async resetPassword() {
      this.v$.$touch();
      if (this.v$.$invalid) return;

      if (this.sending) return;
      this.sending = true;

      try {
        await authApi.resetPassword({ password: this.password, token: this.$route.params.reset_token });
        this.isPasswordResetSuccess = true;
        this.setSnackbar(this.$t('パスワードを再設定しました'), 'status');

        this.v$.$reset();
        this.password = null;
        this.confirmPassword = null;
      } catch (err) {
        const message = appendApiErrorMessage(this.$t('パスワード再設定に失敗しました'), err, { translate: this.$t });
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
</style>
