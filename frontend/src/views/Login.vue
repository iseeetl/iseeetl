<template>
  <div class="view">
    <div class="view-header">
      <BackButton></BackButton>
      <h1 class="view-title">
        {{ $t('ログイン') }}
      </h1>
    </div>

    <div class="view-content">
      <div>
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

        <div class="flex-end">
          <UiButton
            data-testid="login-submit"
            appearance="filled"
            tone="primary"
            :disabled="sending"
            @click.stop="login"
          >
            {{ $t('ログイン') }}
          </UiButton>
        </div>

        <div v-if="capabilitiesFailed" class="capability-error" role="alert">
          <p>{{ $t('新しい画面データを読み込めませんでした。再試行してください。') }}</p>
          <UiButton appearance="text" tone="primary" :disabled="capabilitiesLoading" @click="retryCapabilities">
            {{ $t('再試行') }}
          </UiButton>
        </div>

        <p v-if="mailDeliveryAvailable">
          <router-link class="text-link" :to="{ name: 'Register', query: roomContextQuery }">
            {{ $t('ユーザ登録へ') }}
          </router-link>
        </p>
        <p v-if="mailDeliveryAvailable">
          <router-link class="text-link" :to="{ name: 'SendResetPasswordLink', query: roomContextQuery }">
            {{ $t('パスワードが分からない方はこちらへ') }}
          </router-link>
        </p>

        <div v-if="oauthAvailable" class="oauth-separator" role="separator">
          <span>{{ $t('または') }}</span>
        </div>

        <GoogleLoginButton
          v-if="googleLoginAvailable"
          :lang="preferredUiLang()"
          @success="onGoogleSuccess"
          @error="onOauthError"
        />

        <LineLoginButton
          v-if="lineLoginAvailable"
          :lang="preferredUiLang()"
          :floor-id="roomContextQuery.floor_id || ''"
          :room-id="roomContextQuery.room_id || ''"
          @success="onLineSuccess"
          @error="onOauthError"
        />

        <i18n-t
          keypath="メール・パスワードまたはGoogle、LINEログインすることで、{terms}、{privacy}及び{cookie}に同意したものとみなされます。"
          tag="p"
          scope="global"
          class="login-consent-note"
          data-testid="login-consent-notice"
        >
          <template #terms>
            <router-link
              class="text-link"
              data-testid="login-consent-terms-link"
              :to="{ name: 'Terms', query: roomContextQuery }"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('利用許諾・著作権・禁止事項・免責事項') }}
            </router-link>
          </template>
          <template #privacy>
            <router-link
              class="text-link"
              data-testid="login-consent-privacy-link"
              :to="{ name: 'Privacy', query: roomContextQuery }"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('プライバシーポリシー') }}
            </router-link>
          </template>
          <template #cookie>
            <router-link
              class="text-link"
              data-testid="login-cookie-policy-link"
              :to="{ name: 'CookiePolicy', query: roomContextQuery }"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('Cookieポリシー') }}
            </router-link>
          </template>
        </i18n-t>
      </div>
    </div>
  </div>
</template>

<script>
import authApi from '@/api/auth';
import { appendApiErrorMessage } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength, email } from '@vuelidate/validators';
import { normalizeSupportedLocale, resolveBrowserLocale } from '@/utils/locale.js';
import BackButton from '@/components/common/BackButton.vue';
import { initializeOneSignalSdk, maybeLoginOneSignal } from '@/utils/onesignalHelpers';
import GoogleLoginButton from '@/components/login/GoogleLoginButton.vue';
import LineLoginButton from '@/components/login/LineLoginButton.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { buildRoomContextQuery, resolveRoomContextIds } from '@/utils/routeRoomContext';

export default {
  name: 'Login',
  components: { BackButton, GoogleLoginButton, LineLoginButton, UiButton, UiField, UiIcon },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      mail: '',
      password: '',
      passwordFieldType: 'password',
      passwordVisibilityIcon: 'visibility',
      sending: false,
    };
  },
  validations: {
    mail: { required, email, maxLength: maxLength(100) },
    password: { required, minLength: minLength(8), maxLength: maxLength(16) },
  },
  computed: {
    capabilitiesFailed() {
      return this.$store.getters.capabilitiesFailed;
    },
    capabilitiesLoading() {
      return this.$store.getters.capabilityStatus === 'loading';
    },
    googleLoginAvailable() {
      return this.$store.getters.googleLoginAvailable;
    },
    lineLoginAvailable() {
      return this.$store.getters.lineLoginAvailable;
    },
    mailDeliveryAvailable() {
      return this.$store.getters.mailDeliveryAvailable;
    },
    oneSignalPushAvailable() {
      return this.$store.getters.oneSignalPushAvailable;
    },
    oauthAvailable() {
      return this.googleLoginAvailable || this.lineLoginAvailable;
    },
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'both', trim: true });
    },
  },
  created() {
    this.consumeOauthHashIfAny();
  },
  methods: {
    initializeOneSignalSdk() {
      return initializeOneSignalSdk();
    },
    async retryCapabilities() {
      try {
        await this.$store.dispatch('doLoadCapabilities');
        if (!this.$store.getters.oneSignalPushAvailable) return false;
        return await this.initializeOneSignalSdk();
      } catch {
        return false;
      }
    },
    togglePasswordVisibility() {
      this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
      this.passwordVisibilityIcon = this.passwordFieldType === 'password' ? 'visibility' : 'visibility_off';
    },
    validationMailError() {
      const v = this.v$.mail;
      if (!v.$dirty) return '';
      if (v.required.$invalid) return this.$t('メールの入力は必須です');
      if (v.email.$invalid) return this.$t('メールアドレスの形式が正しくありません。入力し直してください。');
      if (v.maxLength.$invalid) return this.$t('メールは100文字以内にしてください');
      return '';
    },
    validationPasswordError() {
      const v = this.v$.password;
      if (!v.$dirty) return '';
      if (v.required.$invalid) return this.$t('パスワードの入力は必須です');
      if (v.minLength.$invalid || v.maxLength.$invalid) return this.$t('パスワードは8文字以上16文字以内にしてください');
      return '';
    },

    preferredUiLang() {
      // 保存済みの表示言語を、ブラウザの言語より優先する。
      const storeLang = this.$store?.getters?.lang;
      if (typeof storeLang !== 'undefined' && storeLang !== null) return normalizeSupportedLocale(storeLang);

      return resolveBrowserLocale(window.navigator);
    },

    redirectAfterLogin() {
      const { floorId, roomId } = resolveRoomContextIds(this.$route, { source: 'both', trim: true });
      if (floorId && roomId) this.$router.push({ path: `/floor/${floorId}/room/${roomId}` });
      else this.$router.push({ name: 'Floor' });
    },

    async login() {
      this.v$.$touch();
      if (this.v$.$invalid || this.sending) return;
      this.sending = true;
      try {
        const res = await authApi.login({ mail: this.mail, password: this.password });
        this.sending = false;
        const browserLang = resolveBrowserLocale(window.navigator);

        this.$store.dispatch('doUpdateLoginUser', {
          id: res.data.user_id,
          role: res.data.user_role,
          name: res.data.user_name,
          lang: normalizeSupportedLocale(res.data.lang, browserLang),
          imageName: res.data.image_name,
          token: res.data.token,
          eyeFriendlyMode: typeof res.data.eye_friendly_mode === 'boolean' ? res.data.eye_friendly_mode : false,
          pushEnabled: typeof res.data.push_enabled === 'boolean' ? res.data.push_enabled : false,
          replyPushEnabled: typeof res.data.reply_push_enabled === 'boolean' ? res.data.reply_push_enabled : true,
          repliedPostPushEnabled:
            typeof res.data.replied_post_push_enabled === 'boolean' ? res.data.replied_post_push_enabled : true,
        });

        if (this.oneSignalPushAvailable) {
          maybeLoginOneSignal(res.data.onesignal_external_id);
        }

        this.$i18n.locale = this.$store.getters.lang;

        this.v$.$reset();
        this.mail = '';
        this.password = '';

        this.redirectAfterLogin();
        this.setSnackbar(this.$t('ログインしました'));
      } catch (e) {
        this.sending = false;
        let message = this.$t('ログインに失敗しました');
        message = appendApiErrorMessage(message, e, { translate: this.$t });
        this.setSnackbar(message, 'alert');
      }
    },
    async onGoogleSuccess(idToken) {
      try {
        const res = await authApi.loginWithGoogle({ idToken, lang: this.preferredUiLang() });
        this.afterLogin(res.data);
      } catch (e) {
        this.onOauthError(e);
      }
    },

    consumeOauthHashIfAny() {
      const hash = window.location.hash || '';
      if (!hash.startsWith('#')) return;
      const qs = new URLSearchParams(hash.slice(1));
      if (qs.get('oauth') !== 'line') return;
      try {
        if (!this.lineLoginAvailable) return;
        const dataParam = qs.get('data');
        if (!dataParam) return;
        const raw = atob(decodeURIComponent(dataParam));
        const json = JSON.parse(decodeURIComponent(escape(raw)));
        this.afterLogin(json);
      } catch (e) {
        void e;
      } finally {
        // ログイン結果をURLに残さないよう、処理の成否にかかわらずハッシュを削除する。
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
          window.location.hash = '';
        }
      }
    },

    onLineSuccess(payload) {
      this.afterLogin(payload);
    },
    onOauthError(error) {
      const defaultMessage = this.$t('ログインに失敗しました');
      if (error?.code === 'GOOGLE_OAUTH_CLIENT_ID_MISSING') {
        this.setSnackbar(defaultMessage, 'alert');
        return;
      }
      let message = defaultMessage;
      message = appendApiErrorMessage(message, error, { translate: this.$t });
      this.setSnackbar(message, 'alert');
    },
    afterLogin(data) {
      this.$store.dispatch('doUpdateLoginUser', {
        id: data.user_id,
        role: data.user_role,
        name: data.user_name,
        lang: normalizeSupportedLocale(data.lang, this.preferredUiLang()),
        imageName: data.image_name,
        token: data.token,
        eyeFriendlyMode: typeof data.eye_friendly_mode === 'boolean' ? data.eye_friendly_mode : false,
        pushEnabled: typeof data.push_enabled === 'boolean' ? data.push_enabled : false,
        replyPushEnabled: typeof data.reply_push_enabled === 'boolean' ? data.reply_push_enabled : true,
        repliedPostPushEnabled:
          typeof data.replied_post_push_enabled === 'boolean' ? data.replied_post_push_enabled : true,
      });
      try {
        if (this.oneSignalPushAvailable) {
          maybeLoginOneSignal(data.onesignal_external_id);
        }
      } catch (_) {
        // OneSignalのログインに失敗しても、アプリのログイン処理を続ける。
        void _;
      }
      this.$i18n.locale = this.$store.getters.lang || this.$i18n.locale;
      this.redirectAfterLogin();
      this.setSnackbar(this.$t('ログインしました'));
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
  },
};
</script>

<style scoped>
.flex-end {
  display: flex;
  justify-content: flex-end;
}
.capability-error {
  margin: 16px 0;
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

.oauth-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  color: #666;
}
.oauth-separator::before,
.oauth-separator::after {
  content: '';
  flex: 1 1 auto;
  border-top: 1px solid #ccc;
}
.oauth-separator > span {
  white-space: nowrap;
  font-size: 0.9rem;
}
.login-consent-note {
  margin-top: 16px;
  color: #666;
  font-size: 0.9rem;
}
</style>
