<template>
  <div v-if="mailDeliveryAvailable" class="view">
    <div class="view-header">
      <BackButton :to="returnTo" :label="returnLabel" />
      <h1 class="view-title">
        {{ $t('パスワード再設定リンク送信') }}
      </h1>
    </div>

    <div class="view-content">
      <div>
        <UiField
          control-id="mail"
          :label="$t('登録しているメール')"
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

        <div class="right-button-wrapper">
          <UiButton
            class="right-button"
            data-testid="account-submit"
            appearance="filled"
            tone="primary"
            :disabled="sending"
            @click.stop="sendResetPasswordLink"
          >
            {{ $t('パスワード再設定リンクを送信') }}
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import authApi from '@/api/auth';
import { appendApiErrorMessage } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength, email } from '@vuelidate/validators';

import BackButton from '@/components/common/BackButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import { buildRoomContextQuery } from '@/utils/routeRoomContext';

export default {
  name: 'SendResetPasswordLink',
  components: {
    BackButton,
    UiButton,
    UiField,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      mail: '',
      sending: false,
    };
  },
  created() {
    this.ensureMailDeliveryAvailable();
  },
  validations: {
    mail: {
      required,
      email,
      maxLength: maxLength(100),
    },
  },
  computed: {
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'query', trim: true });
    },
    returnTo() {
      return this.$route.query.from === 'ChangePassword' && this.$store.getters.userIsLogin
        ? { name: 'ChangePassword' }
        : { name: 'Login', query: this.roomContextQuery };
    },
    returnLabel() {
      return this.returnTo.name === 'ChangePassword' ? 'パスワード変更へ戻る' : 'ログインページへ戻る';
    },
    mailDeliveryAvailable() {
      return this.$store.getters.mailDeliveryAvailable;
    },
  },
  methods: {
    ensureMailDeliveryAvailable() {
      if (this.mailDeliveryAvailable) return true;
      this.$router.replace({ name: 'Login', query: this.roomContextQuery });
      return false;
    },

    validationMailError() {
      const field = this.v$.mail;
      if (!field.$dirty) return '';
      if (field.required.$invalid) return this.$t('メールの入力は必須です');
      if (field.email.$invalid) return this.$t('メールアドレスの形式が正しくありません。入力し直してください。');
      if (field.maxLength.$invalid) return this.$t('メールは100文字以内にしてください');
      return '';
    },

    async sendResetPasswordLink() {
      if (!this.ensureMailDeliveryAvailable()) return;

      this.v$.$touch();
      if (this.v$.$invalid) return;

      if (this.sending) return;
      this.sending = true;

      try {
        await authApi.sendResetPasswordLink({ mail: this.mail });

        this.setSnackbar(this.$t('パスワード再設定メールを送信しました'), 'status');

        this.v$.$reset();
        this.mail = '';
      } catch (err) {
        if (err.response && err.response.status && err.response.status === 429) {
          const message = appendApiErrorMessage(this.$t('回数上限に達しました。時間をおいて再度お試しください'), err, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
        } else {
          const message = appendApiErrorMessage(this.$t('パスワード再設定メールの送信に失敗しました'), err, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
        }
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
