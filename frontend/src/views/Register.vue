<template>
  <div v-if="mailDeliveryAvailable">
    <div class="view">
      <div class="view-header">
        <BackButton :to="{ name: 'Login', query: roomContextQuery }" label="ログインページへ戻る" />
        <h1 class="view-title">
          {{ $t('ユーザ登録') }}
        </h1>
      </div>

      <div class="view-content">
        <div>
          <UiField
            control-id="username"
            :label="`${$t('ユーザ名')} ${$t('必須')} ${$t('20文字まで')}`"
            :invalid="v$.username.$dirty && v$.username.$invalid"
            :error="validationUsernameError()"
          >
            <template #default="{ controlAttrs }">
              <span role="status" class="text-count">{{ username.length }} / 20</span>
              <input
                v-bind="controlAttrs"
                v-model.trim="username"
                maxlength="20"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.username.$touch()"
              />
            </template>
          </UiField>

          <UiField
            control-id="mail"
            :label="`${$t('メール')} ${$t('必須')}`"
            :invalid="v$.mail.$dirty && v$.mail.$invalid"
            :error="validationMailError()"
          >
            <template #default="{ controlAttrs }">
              <input
                v-bind="controlAttrs"
                v-model.trim="mail"
                type="email"
                :disabled="sending"
                aria-required="true"
                required
                @blur="v$.mail.$touch()"
              />
            </template>
          </UiField>

          <UiField
            class="password-field"
            control-id="password"
            :label="`${$t('パスワード')} ${$t('必須')} ${$t('8文字以上')} ${$t('16文字まで')}`"
            :invalid="v$.password.$dirty && v$.password.$invalid"
            :error="validationPasswordError()"
          >
            <template #default="{ controlAttrs }">
              <span role="status" class="text-count">{{ password.length }} / 16</span>
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

          <div class="note-block">
            <p>
              <router-link
                class="text-link"
                :to="{ name: 'Terms', query: roomContextQuery }"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ $t('利用許諾・著作権・禁止事項・免責事項') }}
              </router-link>
            </p>
            <p>
              <router-link
                class="text-link"
                :to="{ name: 'Privacy', query: roomContextQuery }"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ $t('プライバシーポリシー') }}
              </router-link>
            </p>
            <p>
              <router-link
                class="text-link"
                data-testid="register-cookie-policy-link"
                :to="{ name: 'CookiePolicy', query: roomContextQuery }"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ $t('Cookieポリシー') }}
              </router-link>
            </p>
            <input
              type="checkbox"
              id="terms"
              :aria-label="$t('利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意する')"
              aria-required="true"
              v-model="terms"
            />
            <label for="terms">
              {{ $t('利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意する') }}
            </label>
          </div>

          <div class="flex-end">
            <UiButton
              data-testid="account-submit"
              appearance="filled"
              tone="primary"
              :disabled="sending"
              @click.stop="register"
            >
              {{ $t('OK') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :dialogVisible="successDialogVisible"
      :title="$t('ユーザ仮登録完了')"
      :message="
        $t(
          '登録されたメールアドレスへメールを送信しました。メール内容に記載されている手順に沿って本登録を完了してください'
        )
      "
      :confirmLabel="$t('ログインページへ')"
      confirm-tone="primary"
      confirm-icon="login"
      confirm-test-id="register-complete-login"
      initial-focus="[data-testid='register-complete-login']"
      actions-adjacent
      :sending="sending"
      @confirm="onPressLoginButton"
      @close="successDialogVisible = false"
    />
  </div>
</template>

<script>
import authApi from '@/api/auth';
import { appendApiErrorMessage } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength, email } from '@vuelidate/validators';

import BackButton from '@/components/common/BackButton.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { buildRoomContextQuery } from '@/utils/routeRoomContext';

export default {
  name: 'Register',
  components: {
    BackButton,
    ConfirmDialog,
    UiButton,
    UiField,
    UiIcon,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      username: '',
      mail: '',
      password: '',
      passwordFieldType: 'password',
      passwordVisibilityIcon: 'visibility',
      terms: false,
      successDialogVisible: false,
      sending: false,
    };
  },
  created() {
    this.ensureMailDeliveryAvailable();
  },
  validations: {
    username: {
      required,
      minLength: minLength(1),
      maxLength: maxLength(20),
    },
    mail: {
      required,
      email,
      maxLength: maxLength(100),
    },
    password: {
      required,
      minLength: minLength(8),
      maxLength: maxLength(16),
    },
  },
  computed: {
    mailDeliveryAvailable() {
      return this.$store.getters.mailDeliveryAvailable;
    },
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'both' });
    },
  },
  methods: {
    ensureMailDeliveryAvailable() {
      if (this.mailDeliveryAvailable) return true;
      this.$router.replace({ name: 'Login', query: this.roomContextQuery });
      return false;
    },

    togglePasswordVisibility() {
      if (this.passwordFieldType === 'password') {
        this.passwordFieldType = 'text';
        this.passwordVisibilityIcon = 'visibility_off';
      } else {
        this.passwordFieldType = 'password';
        this.passwordVisibilityIcon = 'visibility';
      }
    },

    validationUsernameError() {
      const field = this.v$.username;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('ユーザ名の入力は必須です');
      if (field.maxLength.$invalid) return this.$t('ユーザ名は20文字以内にしてください');
      return '';
    },
    validationMailError() {
      const field = this.v$.mail;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('メールの入力は必須です');
      if (field.email.$invalid) return this.$t('メールアドレスの形式が正しくありません。入力し直してください。');
      if (field.maxLength.$invalid) return this.$t('メールは100文字以内にしてください');
      return '';
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

    register(event) {
      event.preventDefault();
      if (!this.ensureMailDeliveryAvailable()) return;

      this.v$.$touch();
      if (this.v$.$invalid) {
        this.setSnackbar(this.$t('入力を確認してください'), 'alert');
        return;
      }

      if (this.terms === false) {
        this.setSnackbar(this.$t('利用規約に同意されていません'), 'alert');
        return;
      }

      if (this.sending) return;
      this.sending = true;

      const newUser = {
        username: this.username,
        mail: this.mail,
        password: this.password,
        lang: this.$i18n.locale,
      };

      const qRoomId = typeof this.$route.query.room_id === 'string' ? this.$route.query.room_id.trim() : '';
      if (qRoomId) {
        newUser.room_id = qRoomId;
      }

      authApi
        .register(newUser)
        .then(() => {
          this.sending = false;

          this.v$.$reset();
          this.username = '';
          this.mail = '';
          this.password = '';
          this.terms = false;
          this.successDialogVisible = true;
        })
        .catch((e) => {
          this.sending = false;

          let message = this.$t('ユーザ登録に失敗しました');
          message = appendApiErrorMessage(message, e, { translate: this.$t });
          this.setSnackbar(message, 'alert');
        });
    },

    onPressLoginButton() {
      this.$router.push({ name: 'Login' });
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
  },
};
</script>

<style scoped>
.note-block {
  width: 100%;
  border: 1px solid lightgray;
  text-align: start;
  padding: 16px;
  margin-bottom: 16px;
}
.note-block a {
  text-decoration: underline;
  font-size: 16px;
}
.flex-end {
  display: flex;
  justify-content: flex-end;
}

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
