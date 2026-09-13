<template>
  <BaseEditDialog
    class="guest-profile-dialog"
    :visible="visible"
    title-id="guest_profile_dialog_title"
    :title-text="$t('ゲストプロフィール設定')"
    description-ids="guest_profile_dialog_description"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('managementUi.save')"
    cancel-test-id="dialog-guest-profile-cancel-desktop"
    mobile-cancel-test-id="dialog-guest-profile-cancel-mobile"
    confirm-test-id="dialog-guest-profile-confirm"
    initial-focus="#guest_name"
    actions-adjacent
    data-testid="dialog-guest-profile"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
    @opened="openedDialog"
    @closed="closedDialog"
  >
    <fieldset>
      <legend id="guest_profile_dialog_description">
        {{ $t('ゲストで使用するユーザ名と言語の設定') }}
      </legend>

      <div class="edit-input-field">
        <UiField
          control-id="guest_name"
          :label="`${$t('ユーザ名')} ${$t('必須')} ${$t('20文字まで')}`"
          :invalid="guestNameInvalid"
          :error="guestNameError"
        >
          <template #default="{ controlAttrs }">
            <span role="status" class="text-count">{{ guestName.length }} / 20</span>
            <input
              v-bind="controlAttrs"
              ref="guestNameRef"
              v-model="guestName"
              dir="auto"
              class="guest-name"
              type="text"
              maxlength="20"
              aria-required="true"
              required
              @blur="v$.guestName.$touch()"
            />
          </template>
        </UiField>
      </div>

      <div class="edit-input-field">
        <LanguageSelector v-model="lang" control-id="guest_profile_lang" @change="changeLang" />
      </div>
    </fieldset>

    <div class="edit-input-field">
      <p>{{ $t('画像データ、動画データ、音データ、字幕データのアップロードにはログインが必要です') }}</p>
      <p>
        <router-link
          class="text-link"
          :to="{ name: 'Login', query: roomContextQuery }"
          @click="onPressCancelButton"
        >
          {{ $t('ログインページへ') }}
        </router-link>
      </p>
    </div>
  </BaseEditDialog>
</template>

<script>
import { useOptionsVuelidate } from '@/utils/validation';
import { required, minLength, maxLength } from '@vuelidate/validators';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import LanguageSelector from '@/components/common/LanguageSelector.vue';
import UiField from '@/components/ui/UiField.vue';
import { buildRoomContextQuery } from '@/utils/routeRoomContext';

export default {
  emits: ['close', 'success'],
  name: 'GuestProfileDialog',
  components: {
    BaseEditDialog,
    LanguageSelector,
    UiField,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  props: {
    dialogVisible: Boolean,
  },
  validations: {
    guestName: {
      required,
      minLength: minLength(1),
      maxLength: maxLength(20),
    },
  },
  data() {
    return {
      visible: this.dialogVisible,
      guestName: '',
      lang: null,
    };
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  computed: {
    roomContextQuery() {
      return buildRoomContextQuery(this.$route, { source: 'params' });
    },
    guestNameInvalid() {
      return this.v$.guestName.$dirty && this.v$.guestName.$invalid;
    },
    guestNameError() {
      if (!this.v$.guestName.$dirty) return '';
      if (this.v$.guestName.required.$invalid) return this.$t('ユーザ名の入力は必須です');
      if (this.v$.guestName.maxLength.$invalid) return this.$t('ユーザ名は20文字以内にしてください');
      return '';
    },
  },
  methods: {
    openedDialog() {
      if (this.$store.getters.guestName !== null) {
        this.guestName = this.$store.getters.guestName;
      } else {
        this.guestName = this.$t('ゲスト');
      }

      if (this.$store.getters.lang !== null) {
        this.lang = this.$store.getters.lang;
      } else {
        this.lang = this.$i18n.locale;
      }
    },

    changeLang(selectedLang) {
      this.lang = selectedLang;
      this.$store.dispatch('doSetLang', {
        lang: selectedLang,
      });
      this.$i18n.locale = selectedLang;
    },

    onPressCancelButton() {
      this.visible = false;
    },

    onPressDoneButton() {
      this.v$.$touch();
      if (this.v$.$invalid) return;

      this.updateGuestUser();
    },

    updateGuestUser() {
      this.$store.dispatch('doUpdateGuestUser', {
        guest_id: this.$store.getters.guestId,
        guest_name: this.guestName,
        lang: this.lang,
      });

      this.$emit('success');
    },

    clearValue() {
      this.v$.$reset();

      this.guestName = '';
      this.lang = null;
    },

    closedDialog(payload) {
      this.clearValue();

      this.$emit('close', payload);
    },
  },
};
</script>

<style scoped>
#guest_profile_dialog_description {
  padding-inline-start: 8px;
}
</style>
