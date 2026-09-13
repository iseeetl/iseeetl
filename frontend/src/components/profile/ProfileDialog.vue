<template>
  <BaseEditDialog
    class="profile-dialog"
    v-model:visible="visible"
    :sending="sending"
    :title-id="dialogTitleId"
    :title-text="$t('プロフィール')"
    :cancel-label="$t('キャンセル')"
    :confirm-label="$t('managementUi.save')"
    :progress-amount="progressAmount"
    :confirm-disabled="committedProfile === null"
    initial-focus="#username"
    actions-adjacent
    cancel-test-id="dialog-profile-cancel-desktop"
    mobile-cancel-test-id="dialog-profile-cancel-mobile"
    confirm-test-id="dialog-profile-confirm"
    data-testid="dialog-profile"
    @opened="openedDialog"
    @closed="closedDialog"
    @cancel="onPressCancelButton"
    @confirm="onPressDoneButton"
  >
    <div v-if="fetchError" class="profile-dialog__load-state" role="alert">
      <p>{{ $t('プロフィールの取得に失敗しました') }}</p>
      <UiButton
        appearance="filled"
        tone="primary"
        data-testid="dialog-profile-retry"
        :disabled="fetching"
        @click="fetchUser"
      >
        {{ $t('再試行') }}
      </UiButton>
    </div>

    <div v-else-if="committedProfile === null" class="profile-dialog__load-state" role="status">
      <p>{{ $t('読み込み中です') }}</p>
    </div>

    <div v-else class="profile-dialog__content">
      <div v-if="$store.getters.userRole === 'Editor'" class="profile-role">
        <p>{{ $t('権限') }}</p>
        <p>{{ $t('フロア編集者') }}</p>
      </div>

      <UiField
        class="input-field"
        control-id="username"
        :label="`${$t('ユーザ名')} ${$t('必須')} ${$t('20文字まで')}`"
        :invalid="v$.username.$dirty && v$.username.$invalid"
        :error="validationErrorMessage('username')"
      >
        <template #default="{ controlAttrs }">
          <span role="status" class="text-count">{{ username.length }} / 20</span>
          <input
            v-bind="controlAttrs"
            ref="usernameInput"
            v-model="username"
            dir="auto"
            maxlength="20"
            aria-required="true"
            required
            :disabled="sending"
            @blur="v$.username.$touch()"
          />
        </template>
      </UiField>

      <div class="input-field select-icon">
        <span>{{ $t('アイコンにする画像') }}</span>
        <UiButton
          ref="imageSelectButton"
          class="image-select-button"
          icon-only
          :aria-label="$t('アイコンにする画像')"
          :title="$t('アイコンにする画像')"
          :disabled="sending"
          @click="selectImageFile"
        >
          <UiIcon name="photo" />
        </UiButton>
        <input
          id="image-file"
          ref="imageFile"
          type="file"
          hidden
          :accept="allowedImageTypes"
          :disabled="sending"
          @change="changeImageFile"
        />
      </div>

      <div v-if="imageData !== null || imageName !== null" class="input-field avatar-wrapper">
        <div v-if="imageData !== null" class="avatar-preview-wrapper">
          <UiAvatar>
            <img :src="imageData" :alt="$t('アイコンにする画像')" />
          </UiAvatar>
          <UiButton
            class="avatar-remove-button"
            appearance="filled"
            tone="neutral"
            density="dense"
            icon-only
            :aria-label="imageSelectionCancelLabel"
            :disabled="sending"
            @click.stop="removeImageFile"
          >
            <UiIcon name="clear" />
          </UiButton>
        </div>

        <div v-else-if="imageName !== null" class="avatar-uploaded-wrapper">
          <UiAvatar>
            <img :alt="$t('アイコンにする画像')" :src="`/profile/${$store.getters.userId}/${imageName}`" />
          </UiAvatar>
          <UiButton
            class="avatar-remove-button"
            appearance="filled"
            tone="neutral"
            density="dense"
            icon-only
            :aria-label="$t('アイコンを削除する')"
            :disabled="sending"
            @click.stop="deleteUploadedImageFile"
          >
            <UiIcon name="clear" />
          </UiButton>
        </div>
      </div>

      <fieldset class="input-field language-field" :disabled="sending">
        <LanguageSelector
          v-model="lang"
          control-id="lang"
          @change="changeLang"
        />
      </fieldset>

      <div class="input-field eye-friendly-mode-wrapper">
        <div class="eye-friendly-mode-row">
          <div class="checkbox-column">
            <input
              id="eye_friendly_mode"
              v-model="eyeFriendlyMode"
              type="checkbox"
              class="checkbox-input"
              :disabled="sending"
            />
          </div>
          <div class="label-column">
            <label class="checkbox-label" for="eye_friendly_mode">
              {{ $t('目にやさしいモード') }}
            </label>
            <p class="help-text">
              {{ $t('有効にすると、タイムラインの文字サイズが大きくなり、アニメーションは停止します。') }}
            </p>
          </div>
        </div>
      </div>

      <fieldset v-if="oneSignalPushAvailable" class="push-settings input-field">
        <legend class="push-settings__legend">
          {{ $t('Webプッシュ通知設定') }}
        </legend>

        <UiButton
          type="button"
          class="push-notify-button"
          appearance="filled"
          tone="primary"
          :disabled="loading || sending || committedProfile === null"
          @click="togglePush"
        >
          {{ pushEnabled ? $t('Webプッシュ通知を停止') : $t('Webプッシュ通知を開始') }}
        </UiButton>

        <div class="push-settings__checkbox">
          <input
            id="reply_push"
            v-model="replyPushEnabled"
            type="checkbox"
            :disabled="sending || !pushEnabled"
          />
          <label for="reply_push">
            {{ $t('自分の投稿に返信があったときに通知を受け取る') }}
          </label>
        </div>

        <div class="push-settings__checkbox">
          <input
            id="replied_post_push"
            v-model="repliedPostPushEnabled"
            type="checkbox"
            :disabled="sending || !pushEnabled"
          />
          <label for="replied_post_push">
            {{ $t('自分が返信した投稿に新しい返信があったときに通知を受け取る') }}
          </label>
        </div>
      </fieldset>

      <div class="input-field">
        <UiButton
          class="password-change-button"
          appearance="filled"
          tone="primary"
          :disabled="sending"
          @click.stop="onPressChangePasswordButton"
        >
          {{ $t('パスワード変更') }}
        </UiButton>
      </div>
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
    @confirm="confirmDiscardChanges"
    @cancel="cancelDiscardChanges"
    @closed="handleDiscardConfirmationClosed"
  />
</template>

<script>
import { useId } from 'vue';
import { required, maxLength } from '@vuelidate/validators';
import uploadApi from '@/api/upload';
import userApi from '@/api/user';
import { appendApiErrorMessage } from '@/api/apiClient';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import LanguageSelector from '@/components/common/LanguageSelector.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { ALLOWED_IMAGE_TYPES, isAllowedImageFile, isImageSizeWithinLimit } from '@/constants/mediaConstants';
import { cropAndCompressImage } from '@/utils/imageUtil';
import { normalizeSupportedLocale } from '@/utils/locale.js';
import { useOptionsVuelidate } from '@/utils/validation';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export default {
  name: 'ProfileDialog',
  emits: ['close', 'success', 'change-password'],
  components: {
    BaseEditDialog,
    ConfirmDialog,
    LanguageSelector,
    UiAvatar,
    UiButton,
    UiField,
    UiIcon,
  },
  props: {
    dialogVisible: {
      type: Boolean,
      required: true,
    },
  },
  setup() {
    const instancePrefix = `profile-dialog-${useId()}`;

    return {
      v$: useOptionsVuelidate(),
      dialogTitleId: `${instancePrefix}-title`,
    };
  },
  data() {
    return {
      visible: this.dialogVisible,
      username: '',
      imageData: null,
      imageFile: null,
      imageName: null,
      lang: null,
      eyeFriendlyMode: false,
      pushEnabled: false,
      replyPushEnabled: true,
      repliedPostPushEnabled: true,

      originalLang: null,
      committedProfile: null,
      initialSnapshot: null,

      loading: true,
      oneSignalSynced: false,
      sending: false,
      fetching: false,
      progressAmount: 0,

      discardConfirmVisible: false,
      discardConfirmed: false,
      pendingCloseAction: null,
      fetchError: false,
      openGeneration: 0,
    };
  },
  validations: {
    username: {
      required,
      maxLength: maxLength(20),
    },
  },
  watch: {
    dialogVisible(nextValue) {
      this.visible = nextValue;
    },
  },
  beforeUnmount() {
    this.openGeneration += 1;
    this.restoreUnsavedLocale();
    this.stopOneSignalSync();
  },
  computed: {
    oneSignalPushAvailable() {
      return this.$store.getters.oneSignalPushAvailable;
    },
    allowedImageTypes() {
      return ALLOWED_IMAGE_TYPES.join(',');
    },
    imageSelectionCancelLabel() {
      return `${this.$t('アイコンにする画像')}・${this.$t('キャンセル')}`;
    },
  },
  methods: {
    openedDialog() {
      this.openGeneration += 1;
      this.prepareForOpen();
      this.startOneSignalSync();
      void this.fetchUser();
    },

    prepareForOpen() {
      this.v$.$reset();
      this.clearImageSelection();
      this.username = '';
      this.imageName = null;
      this.lang = null;
      this.eyeFriendlyMode = false;
      this.replyPushEnabled = true;
      this.repliedPostPushEnabled = true;
      this.originalLang = normalizeSupportedLocale(this.$i18n.locale, this.$store.getters.lang || 'en');
      this.committedProfile = null;
      this.initialSnapshot = null;
      this.progressAmount = 0;
      this.discardConfirmVisible = false;
      this.discardConfirmed = false;
      this.pendingCloseAction = null;
      this.fetchError = false;
      this.fetching = false;
      this.loading = this.oneSignalPushAvailable;
    },

    startOneSignalSync() {
      this.stopOneSignalSync();
      if (!this.oneSignalPushAvailable) {
        this.loading = false;
        return;
      }

      const generation = this.openGeneration;
      const init = (OS) => {
        if (!this.visible || generation !== this.openGeneration) return;
        if (!(OS?.User?.PushSubscription && OS?.Notifications)) {
          this.loading = false;
          return;
        }

        this._osSdk = OS;
        this.pushEnabled = Boolean(OS.User.PushSubscription.optedIn);
        this.oneSignalSynced = true;
        this.loading = false;
        this._osSyncState = () => {
          if (!this.visible || generation !== this.openGeneration) return;
          this.pushEnabled = Boolean(OS.User.PushSubscription.optedIn);
        };
        OS.User.PushSubscription.addEventListener?.('change', this._osSyncState);
        OS.Notifications.addEventListener?.('permissionChange', this._osSyncState);
      };

      if (window.OneSignal?.User?.PushSubscription) {
        init(window.OneSignal);
        return;
      }

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(init);
      this.loading = false;
    },

    stopOneSignalSync() {
      if (this._osSyncState && this._osSdk?.User?.PushSubscription) {
        this._osSdk.User.PushSubscription.removeEventListener?.('change', this._osSyncState);
        this._osSdk.Notifications.removeEventListener?.('permissionChange', this._osSyncState);
      }
      this._osSyncState = null;
      this._osSdk = null;
      this.oneSignalSynced = false;
      this.loading = false;
    },

    normalizeProfile(data = {}, fallback = {}) {
      const fallbackLang = normalizeSupportedLocale(
        fallback.lang || this.$store.getters.lang || this.$i18n.locale,
        'en'
      );

      return {
        username: typeof data.username === 'string' ? data.username : fallback.username || '',
        imageName: hasOwn(data, 'image_name') ? data.image_name : (fallback.imageName ?? null),
        lang: normalizeSupportedLocale(data.lang || fallback.lang, fallbackLang),
        eyeFriendlyMode:
          typeof data.eye_friendly_mode === 'boolean'
            ? data.eye_friendly_mode
            : Boolean(fallback.eyeFriendlyMode),
        pushEnabled:
          typeof data.push_enabled === 'boolean' ? data.push_enabled : Boolean(fallback.pushEnabled),
        replyPushEnabled:
          typeof data.reply_push_enabled === 'boolean'
            ? data.reply_push_enabled
            : fallback.replyPushEnabled !== false,
        repliedPostPushEnabled:
          typeof data.replied_post_push_enabled === 'boolean'
            ? data.replied_post_push_enabled
            : fallback.repliedPostPushEnabled !== false,
      };
    },

    applyProfileToForm(profile, { preserveSyncedPush = false } = {}) {
      this.username = profile.username;
      this.imageName = profile.imageName;
      this.lang = profile.lang;
      this.eyeFriendlyMode = profile.eyeFriendlyMode;
      if (!preserveSyncedPush || !this.oneSignalSynced) {
        this.pushEnabled = profile.pushEnabled;
      }
      this.replyPushEnabled = profile.replyPushEnabled;
      this.repliedPostPushEnabled = profile.repliedPostPushEnabled;
    },

    captureInitialSnapshot() {
      this.initialSnapshot = this.getEditSnapshot();
    },

    getEditSnapshot() {
      return JSON.stringify({
        username: this.username,
        imageName: this.imageName,
        imageSelected: this.imageFile !== null || this.imageData !== null,
        lang: this.lang,
        eyeFriendlyMode: this.eyeFriendlyMode,
        replyPushEnabled: this.replyPushEnabled,
        repliedPostPushEnabled: this.repliedPostPushEnabled,
      });
    },

    hasUnsavedChanges() {
      return this.initialSnapshot !== null && this.initialSnapshot !== this.getEditSnapshot();
    },

    async fetchUser() {
      if (this.fetching) return;
      const generation = this.openGeneration;
      this.fetchError = false;
      this.fetching = true;

      try {
        const res = await userApi.fetchDetail();
        if (!this.visible || generation !== this.openGeneration) return;
        const profile = this.normalizeProfile(res.data, {
          lang: this.$store.getters.lang,
          pushEnabled: this.pushEnabled,
          replyPushEnabled: true,
          repliedPostPushEnabled: true,
        });

        this.committedProfile = profile;
        this.applyProfileToForm(profile, { preserveSyncedPush: true });
        this.originalLang = profile.lang;
        this.$i18n.locale = profile.lang;
        this.v$.$reset();
        this.clearImageSelection();
        this.captureInitialSnapshot();
        await this.$nextTick();
        if (this.visible && generation === this.openGeneration) {
          this.$refs.usernameInput?.focus();
        }
      } catch (error) {
        if (!this.visible || generation !== this.openGeneration) return;
        this.fetchError = true;
        this.handleApiError(error, this.$t('プロフィールの取得に失敗しました'));
      } finally {
        if (generation === this.openGeneration) this.fetching = false;
      }
    },

    validationErrorMessage(field) {
      const validation = this.v$[field];
      if (!validation.$dirty) return '';
      if (validation.required.$invalid) return this.$t('ユーザ名の入力は必須です');
      if (validation.maxLength.$invalid) return this.$t('ユーザ名は20文字以内にしてください');
      return '';
    },

    changeLang(selectedLang) {
      if (this.sending) return;
      this.lang = selectedLang;
      this.$i18n.locale = selectedLang;
    },

    async changeImageFile(event) {
      event.preventDefault();
      if (this.sending) return;

      const file = event.target.files[0];
      if (!file) return;

      try {
        if (!isAllowedImageFile(file)) {
          this.setSnackbar(`${this.$t('対象ファイルではありません')} ${ALLOWED_IMAGE_TYPES.join(',')}`, 'alert');
          event.target.value = '';
          return;
        }

        const { base64, blob } = await cropAndCompressImage(file, 200, 0.5);
        if (!isImageSizeWithinLimit(blob.size)) {
          this.setSnackbar(this.$t('メディアのファイルサイズが上限を超えています。'), 'alert');
          event.target.value = '';
          return;
        }

        this.imageData = base64;
        this.imageFile = blob;
      } catch {
        this.setSnackbar(this.$t('画像の処理に失敗しました'), 'alert');
      }
    },

    async removeImageFile() {
      if (this.sending) return;
      this.clearImageSelection();
      await this.$nextTick();
      this.focusImageFileInput();
    },

    clearImageSelection() {
      if (this.$refs.imageFile) this.$refs.imageFile.value = '';
      this.imageData = null;
      this.imageFile = null;
    },

    selectImageFile() {
      if (this.sending) return;
      this.$refs.imageFile.click();
    },

    focusImageFileInput() {
      this.$refs.imageSelectButton?.focus();
    },

    async deleteUploadedImageFile() {
      if (this.sending) return;
      this.imageName = null;
      await this.$nextTick();
      this.focusImageFileInput();
    },

    onPressDoneButton() {
      if (this.sending || this.committedProfile === null) return;

      this.v$.$touch();
      if (this.v$.$invalid) {
        this.setSnackbar(this.$t('入力を確認してください'), 'alert');
        return;
      }

      if (this.imageFile !== null) {
        return this.imageUpload();
      }
      return this.editUser();
    },

    buildProfilePayload(imageNameForUpdate = this.imageName) {
      return {
        username: this.username,
        image_name: imageNameForUpdate,
        lang: this.lang,
        eye_friendly_mode: this.eyeFriendlyMode,
        push_enabled: this.pushEnabled,
        reply_push_enabled: this.replyPushEnabled,
        replied_post_push_enabled: this.repliedPostPushEnabled,
      };
    },

    buildCommittedProfilePayload(pushEnabled) {
      if (!this.committedProfile) return null;

      return {
        username: this.committedProfile.username,
        image_name: this.committedProfile.imageName,
        lang: this.committedProfile.lang,
        eye_friendly_mode: this.committedProfile.eyeFriendlyMode,
        push_enabled: pushEnabled,
        reply_push_enabled: this.committedProfile.replyPushEnabled,
        replied_post_push_enabled: this.committedProfile.repliedPostPushEnabled,
      };
    },

    updateProgress(progressEvent) {
      const total = Number(progressEvent?.total);
      const loaded = Number(progressEvent?.loaded);
      this.progressAmount = total > 0 && Number.isFinite(loaded) ? Math.floor((loaded * 100) / total) : 0;
    },

    async imageUpload() {
      if (this.sending) return null;
      this.sending = true;
      let stage = 'upload';
      let successData = null;

      try {
        const formData = new FormData();
        formData.append('image_file', this.imageFile, 'image.jpg');
        const uploadResponse = await uploadApi.uploadProfileImage(formData, {
          onUploadProgress: this.updateProgress,
        });

        stage = 'update';
        const payload = this.buildProfilePayload(uploadResponse.data.image_name);
        const response = await userApi.updateProfile(payload, {
          onUploadProgress: this.updateProgress,
        });
        this.applySuccessfulUpdate(response.data, payload);
        successData = response.data;
      } catch (error) {
        const message =
          stage === 'upload'
            ? this.$t('ファイルのアップロードに失敗しました')
            : this.$t('プロフィールの更新に失敗しました');
        this.handleApiError(error, message);
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }

      if (successData !== null) this.$emit('success', successData);
      return successData;
    },

    async editUser(imageNameForUpdate = this.imageName) {
      if (this.sending) return null;
      this.sending = true;
      let successData = null;

      try {
        const payload = this.buildProfilePayload(imageNameForUpdate);
        const response = await userApi.updateProfile(payload, {
          onUploadProgress: this.updateProgress,
        });
        this.applySuccessfulUpdate(response.data, payload);
        successData = response.data;
      } catch (error) {
        this.handleApiError(error, this.$t('プロフィールの更新に失敗しました'));
      } finally {
        this.sending = false;
        this.progressAmount = 0;
      }

      if (successData !== null) this.$emit('success', successData);
      return successData;
    },

    applySuccessfulUpdate(data, payload) {
      const profile = this.normalizeProfile(data, {
        username: payload.username,
        imageName: payload.image_name,
        lang: payload.lang,
        eyeFriendlyMode: payload.eye_friendly_mode,
        pushEnabled: payload.push_enabled,
        replyPushEnabled: payload.reply_push_enabled,
        repliedPostPushEnabled: payload.replied_post_push_enabled,
      });

      this.committedProfile = profile;
      this.applyProfileToForm(profile);
      this.clearImageSelection();
      this.v$.$reset();
      this.originalLang = profile.lang;
      this.$i18n.locale = profile.lang;
      this.captureInitialSnapshot();
      this.dispatchProfileUpdate(profile);
      this.setSnackbar(this.$t('プロフィールを更新しました'), 'status');
    },

    dispatchProfileUpdate(profile) {
      this.$store.dispatch('doUpdateProfile', {
        name: profile.username,
        imageName: profile.imageName,
        lang: profile.lang,
        eyeFriendlyMode: profile.eyeFriendlyMode,
        pushEnabled: profile.pushEnabled,
        replyPushEnabled: profile.replyPushEnabled,
        repliedPostPushEnabled: profile.repliedPostPushEnabled,
      });
    },

    async togglePush() {
      if (!this.oneSignalPushAvailable || this.loading || this.sending || !this.committedProfile) return;

      const OS = window.OneSignal;
      if (!(OS?.User?.PushSubscription && OS?.Notifications)) {
        this.setSnackbar(this.$t('Webプッシュ通知の初期化中です。時間をおいて再度お試しください'), 'alert');
        return;
      }

      this.loading = true;
      this.sending = true;
      let phase = 'subscription';

      try {
        let nextPushEnabled;
        if (this.pushEnabled) {
          await OS.User.PushSubscription.optOut();
          nextPushEnabled = false;
        } else {
          let permission = OS.Notifications.permission;
          if (!permission) {
            this.setSnackbar(this.$t('ブラウザ設定から通知許可を再設定してください'), 'alert');
            permission = await OS.Notifications.requestPermission();
            if (!permission) return;
          }
          await OS.User.PushSubscription.optIn();
          nextPushEnabled = true;
        }

        this.pushEnabled = nextPushEnabled;
        phase = 'persistence';
        await this.persistPushPreference(nextPushEnabled);
        this.setSnackbar(this.$t('プロフィールを更新しました'), 'status');
      } catch (error) {
        const message =
          phase === 'subscription'
            ? this.$t('Webプッシュ通知の設定に失敗しました')
            : this.$t('プロフィールの更新に失敗しました');
        this.handleApiError(error, message);
      } finally {
        this.sending = false;
        this.loading = false;
        this.progressAmount = 0;
      }
    },

    async persistPushPreference(pushEnabled) {
      const payload = this.buildCommittedProfilePayload(pushEnabled);
      if (!payload) return;

      await userApi.updateProfile(payload, {
        onUploadProgress: this.updateProgress,
      });

      this.committedProfile = {
        ...this.committedProfile,
        pushEnabled,
      };
      this.dispatchProfileUpdate(this.committedProfile);
    },

    onPressCancelButton() {
      this.requestClose('close');
    },

    onPressChangePasswordButton() {
      this.requestClose('change-password');
    },

    requestClose(action) {
      if (this.sending) return;
      if (this.hasUnsavedChanges()) {
        this.pendingCloseAction = action;
        this.discardConfirmed = false;
        this.discardConfirmVisible = true;
        return;
      }
      this.completeCloseAction(action);
    },

    confirmDiscardChanges() {
      if (!this.discardConfirmVisible) return;
      this.discardConfirmed = true;
      this.discardConfirmVisible = false;
    },

    cancelDiscardChanges() {
      this.discardConfirmed = false;
      this.pendingCloseAction = null;
      this.discardConfirmVisible = false;
    },

    handleDiscardConfirmationClosed() {
      if (!this.discardConfirmed) return;

      const action = this.pendingCloseAction;
      this.discardConfirmed = false;
      this.pendingCloseAction = null;
      this.completeCloseAction(action);
    },

    completeCloseAction(action) {
      this.restoreUnsavedLocale();
      if (action === 'change-password') {
        this.$emit('change-password');
        return;
      }
      this.visible = false;
    },

    restoreUnsavedLocale() {
      if (this.originalLang && this.$i18n.locale !== this.originalLang) {
        this.$i18n.locale = this.originalLang;
      }
    },

    clearValue() {
      this.v$.$reset();
      this.clearImageSelection();
      this.username = '';
      this.imageName = null;
      this.lang = null;
      this.eyeFriendlyMode = false;
      this.replyPushEnabled = true;
      this.repliedPostPushEnabled = true;
      this.originalLang = null;
      this.committedProfile = null;
      this.initialSnapshot = null;
      this.discardConfirmVisible = false;
      this.discardConfirmed = false;
      this.pendingCloseAction = null;
      this.progressAmount = 0;
      this.fetchError = false;
      this.sending = false;
      this.fetching = false;
    },

    closedDialog(payload) {
      this.openGeneration += 1;
      this.restoreUnsavedLocale();
      this.stopOneSignalSync();
      this.clearValue();
      this.$emit('close', payload);
    },

    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },

    handleApiError(error, defaultMessage = '', role = 'alert') {
      const message = appendApiErrorMessage(defaultMessage, error, { translate: this.$t });
      this.setSnackbar(message, role);
      handleAuthErrorUtil(error, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
@media screen and (max-width: 896px) {
  :global(.profile-dialog) {
    --ui-dialog-width: 640px;
  }
}

:global(.profile-dialog .ui-dialog__panel) {
  overflow: hidden;
}

:global(.profile-dialog .ui-dialog__header),
:global(.profile-dialog .ui-dialog__actions),
:global(.profile-dialog .ui-dialog__status) {
  flex: 0 0 auto;
}

:global(.profile-dialog .ui-dialog__content) {
  min-height: 0;
  flex: 1 1 auto;
  overscroll-behavior: contain;
}

.profile-dialog__content {
  padding-top: 4px;
}

.profile-role p {
  margin: 0 0 8px;
}

.select-icon {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}
.image-select-button {
  margin: 8px 0 0;
  padding: 2px;
  border: 1px solid #ccc;
  background: #fafafa;
  border-radius: 4px;
}

.avatar-wrapper {
  display: flex;
  align-items: center;
  margin-top: 24px;
}

.password-change-button,
.push-notify-button {
  margin-inline-start: 0;
}

.avatar-preview-wrapper,
.avatar-uploaded-wrapper {
  position: relative;
  display: inline-block;
}

.avatar-remove-button {
  position: absolute !important;
  top: -16px;
  inset-inline-end: -24px;
  border-radius: 50%;
}

.input-field {
  margin-bottom: 24px;
}

.eye-friendly-mode-wrapper {
  padding: 8px 0;
}

.eye-friendly-mode-row {
  display: flex;
  align-items: flex-start;
}

.checkbox-column {
  margin-top: 2px;
  margin-inline-end: 8px;
}

.label-column {
  display: flex;
  flex-direction: column;
}

.help-text {
  margin: 0;
}

@media screen and (max-width: 896px) {
  :global(.profile-dialog .ui-dialog__panel) {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    height: calc(100dvh - 16px);
  }

  :global(.profile-dialog .ui-dialog__content) {
    padding-right: max(16px, env(safe-area-inset-right));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
  }

  :global(.profile-dialog .ui-dialog__heading) {
    max-width: calc(100% - 128px);
  }
}
</style>
