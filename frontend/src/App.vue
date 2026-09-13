<template>
  <div id="app_container" :inert="$store.getters.inertAppContainer || null">
    <header v-if="!isArMode" role="banner">
      <AppMenu v-model:menuVisible="menuVisible" @open-profile="showProfileDialog" />

      <div class="header-item" :aria-hidden="menuVisible ? 'true' : null" :inert="menuVisible || null">
        <a href="/" id="app_title" :aria-label="$t('アイシータイムライン')" @click="handleAppTitleClick">
          <span class="iseee"> ISeee </span>
          <span> TimeLine </span>
        </a>

        <div class="avatar-content" v-if="userIsLogin">
          <UiButton
            class="profile-button"
            ref="profileButton"
            data-testid="app-profile-button"
            icon-only
            :aria-label="$t('プロフィール')"
            @click="showProfileDialog"
          >
            <UiAvatar v-if="typeof userImageName === 'undefined' || userImageName === null">
              <UiIcon name="person" :size="32" />
            </UiAvatar>
            <UiAvatar v-else>
              <img
                aria-hidden="true"
                :src="'/profile/' + $store.getters.userId + '/' + $store.getters.userImageName"
                alt=""
              />
            </UiAvatar>
          </UiButton>
        </div>
        <div class="avatar-content" v-else-if="$store.getters.guestId">
          <UiButton
            class="guest-profile-button"
            icon-only
            :aria-label="$t('ゲストプロフィール設定')"
            @click="showGuestProfileDialog"
          >
            <UiAvatar>
              <UiIcon name="person" :size="32" />
            </UiAvatar>
          </UiButton>
        </div>
      </div>
    </header>

    <main
      id="app_content"
      :aria-hidden="contentInert ? 'true' : null"
      :inert="contentInert || null"
    >
      <router-view :key="routeViewKey" />
    </main>

    <ProfileDialog
      :dialog-visible="profileDialogVisible"
      @success="successProfile"
      @close="closeProfileDialog"
      @change-password="changePassword"
    />

    <GuestProfileDialog
      :dialog-visible="guestProfileDialogVisible"
      @success="successGuestProfile"
      @close="closeGuestProfileDialog"
    />

    <HelpDialog :dialog-visible="helpDialogVisible" @close="closeHelpDialog" />

    <div class="screen-reader-only" role="status" aria-live="polite">
      {{ $store.getters.politeMessage }}
    </div>
    <div class="screen-reader-only" role="alert" aria-live="assertive">
      {{ $store.getters.assertiveMessage }}
    </div>
    <UiSnackbar
      data-testid="app-snackbar"
      v-model="snackbarActiveProxy"
      :message="$store.getters.snackbarMessage"
      :position="$store.getters.snackbarPosition"
      :duration="$store.getters.snackbarDuration"
      :is-infinity="$store.getters.snackbarIsInfinity"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex';
import { isCrawlerUserAgent, normalizeSupportedLocale, resolveBrowserLocale } from '@/utils/locale.js';
import { updateDocumentTitle } from '@/router.js';
import AppMenu from '@/components/app/AppMenu.vue';
import GuestProfileDialog from '@/components/app/GuestProfileDialog.vue';
import HelpDialog from '@/components/help/HelpDialog.vue';
import ProfileDialog from '@/components/profile/ProfileDialog.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiSnackbar from '@/components/ui/UiSnackbar.vue';
import {
  beginPlannedPageLeave,
  resetPlannedPageLeave,
  shouldBeginPlannedPageLeaveForClick,
} from '@/utils/plannedPageLeave';

export default {
  components: {
    AppMenu,
    GuestProfileDialog,
    HelpDialog,
    ProfileDialog,
    UiAvatar,
    UiButton,
    UiIcon,
    UiSnackbar,
  },
  inject: {
    analyticsPageReporter: {
      from: 'analyticsPageReporter',
      default: null,
    },
  },
  provide() {
    return {
      passwordChangeNavigation: {
        getReturnTo: () => this.passwordChangeOrigin || { name: 'Floor' },
        reopenProfile: this.reopenProfileAfterNavigation,
      },
    };
  },
  data() {
    return {
      menuVisible: false,

      profileDialogVisible: false,
      profilePendingRouteName: null,
      passwordChangeOrigin: null,
      profileAnalyticsToken: null,
      guestProfileDialogVisible: false,
      helpDialogVisible: false,
    };
  },
  beforeCreate() {
    // 起動時に復元した状態を使って表示言語を決める。
    if (isCrawlerUserAgent(window.navigator.userAgent)) {
      this.$i18n.locale = 'ja';
    } else {
      // 保存済みの言語設定がなければ、ブラウザの言語を使用する。
      if (typeof this.$store.getters.lang === 'undefined' || this.$store.getters.lang === null) {
        const browserLang = resolveBrowserLocale(window.navigator);

        this.$i18n.locale = browserLang;

        this.$store.dispatch('doSetLang', {
          lang: browserLang,
        });
      } else {
        const browserLang = resolveBrowserLocale(window.navigator);
        const normalizedLang = normalizeSupportedLocale(this.$store.getters.lang, browserLang);
        this.$i18n.locale = normalizedLang;
        if (normalizedLang !== this.$store.getters.lang) {
          this.$store.dispatch('doSetLang', { lang: normalizedLang });
        }
      }
    }
  },
  mounted() {
    this.synchronizeDocumentLocale(this.$i18n.locale);

    window.addEventListener('load', this.setFillHeight);
    window.addEventListener('resize', this.setFillHeight);
    window.addEventListener('pagehide', this.handlePageHide);
    window.addEventListener('pageshow', this.handlePageShow);
    document.addEventListener('keydown', this.handleGlobalHelpShortcut);
  },
  beforeUnmount() {
    this.endProfileAnalytics(false);
    document.removeEventListener('keydown', this.handleGlobalHelpShortcut);
    window.removeEventListener('load', this.setFillHeight);
    window.removeEventListener('resize', this.setFillHeight);
    window.removeEventListener('pagehide', this.handlePageHide);
    window.removeEventListener('pageshow', this.handlePageShow);
  },
  watch: {
    userIsLogin(isLogin) {
      if (!isLogin) {
        this.passwordChangeOrigin = null;
        this.profileDialogVisible = false;
        this.profilePendingRouteName = null;
        this.endProfileAnalytics(true);
      }
    },
    '$route.fullPath'() {
      if (
        this.$route.name !== 'ChangePassword' &&
        !(this.$route.name === 'SendResetPasswordLink' && this.$route.query.from === 'ChangePassword')
      ) {
        this.passwordChangeOrigin = null;
      }
      this.profileDialogVisible = false;
      this.profilePendingRouteName = null;
      if (!this.profileAnalyticsToken) return;
      this.endProfileAnalytics(false, {
        deferUntilNavigation: true,
        navigationAlreadyChanged: true,
      });
    },
    // 言語変更時に文書言語とページタイトルを同期する。画面配置は常にLTRとする。
    '$i18n.locale'(newVal) {
      const normalizedLang = normalizeSupportedLocale(newVal);
      if (newVal !== normalizedLang) {
        this.$i18n.locale = normalizedLang;
        this.$store.dispatch('doSetLang', { lang: normalizedLang });
        return;
      }
      this.synchronizeDocumentLocale(normalizedLang);
    },
  },
  computed: {
    ...mapState({
      userIsLogin: (state) => state.user.isLogin,
      userImageName: (state) => state.user.imageName,
    }),
    snackbarActiveProxy: {
      get() {
        return this.$store.getters.snackbarVisible;
      },
      set(newVal) {
        if (newVal === false) {
          this.$store.dispatch('doHideSnackbar');
        }
      },
    },
    isArMode() {
      return this.$route.query.armode === 'on';
    },
    routeViewKey() {
      if (this.$route.name === 'Room') {
        const floorId = String(this.$route.params?.floor_id || '');
        return `room-list:${floorId}`;
      }
      if (['TimeLine', 'TimeLinePostDetail'].includes(this.$route.name)) {
        const floorId = String(this.$route.params?.floor_id || '');
        const roomId = String(this.$route.params?.room_id || '');
        return `timeline:${floorId}:${roomId}`;
      }
      const matchedRoutes = Array.isArray(this.$route.matched) ? this.$route.matched : [];
      return matchedRoutes[matchedRoutes.length - 1]?.path || this.$route.name || 'route';
    },
    contentInert() {
      return this.menuVisible;
    },
  },
  methods: {
    synchronizeDocumentLocale(locale) {
      document.documentElement.setAttribute('lang', locale);
      document.documentElement.setAttribute('dir', 'ltr');
      void this.$nextTick(() => {
        updateDocumentTitle({
          route: this.$route,
          translate: (key) => this.$t(key),
          documentObject: document,
        });
      });
    },
    setFillHeight() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    },

    closeNavigationUi() {
      this.menuVisible = false;
    },
    handleAppTitleClick(event) {
      if (shouldBeginPlannedPageLeaveForClick(event)) {
        beginPlannedPageLeave();
      }
    },
    handlePageHide() {
      beginPlannedPageLeave();
    },
    handlePageShow() {
      resetPlannedPageLeave();
    },
    showProfileDialog() {
      if (this.userIsLogin) {
        this.profilePendingRouteName = null;
        this.profileDialogVisible = true;
        this.beginProfileAnalytics();
      }
    },
    async reopenProfileAfterNavigation() {
      // 画面遷移時のダイアログ終了と、戻り先の描画が済んでから開く。
      await this.$nextTick();
      this.$refs.profileButton?.$el?.focus();
      this.showProfileDialog();
    },
    successProfile() {
      this.profilePendingRouteName = null;
      this.profileDialogVisible = false;
    },
    closeProfileDialog() {
      this.profileDialogVisible = false;
      const changePasswordRequested = this.profilePendingRouteName === 'ChangePassword';
      const alreadyOnChangePassword = this.$route.name === 'ChangePassword';
      const deferredAnalyticsToken =
        changePasswordRequested && !alreadyOnChangePassword
          ? this.profileAnalyticsToken
          : null;
      this.endProfileAnalytics(
        !changePasswordRequested || alreadyOnChangePassword,
        changePasswordRequested && !alreadyOnChangePassword
          ? { deferUntilNavigation: true }
          : undefined
      );
      if (changePasswordRequested) {
        this.profilePendingRouteName = null;
        if (!alreadyOnChangePassword) {
          if (!(this.$route.name === 'SendResetPasswordLink' && this.$route.query.from === 'ChangePassword')) {
            this.passwordChangeOrigin = this.$route.fullPath;
          }
          try {
            const navigation = this.$router.push({ name: 'ChangePassword' });
            if (navigation && typeof navigation.then === 'function') {
              void navigation
                .then((failure) => {
                  if (failure) {
                    this.restoreProfileAnalyticsAfterNavigationFailure(deferredAnalyticsToken);
                  }
                })
                .catch(() => {
                  this.restoreProfileAnalyticsAfterNavigationFailure(deferredAnalyticsToken);
                });
            }
          } catch (_error) {
            this.restoreProfileAnalyticsAfterNavigationFailure(deferredAnalyticsToken);
          }
        }
      }
    },
    changePassword() {
      this.profilePendingRouteName = 'ChangePassword';
      this.profileDialogVisible = false;
    },
    beginProfileAnalytics() {
      if (this.profileAnalyticsToken) return true;
      try {
        this.profileAnalyticsToken =
          this.analyticsPageReporter?.beginVirtualPage?.('Profile') || null;
        return this.profileAnalyticsToken !== null;
      } catch (_error) {
        this.profileAnalyticsToken = null;
        return false;
      }
    },
    endProfileAnalytics(restore, {
      deferUntilNavigation = false,
      navigationAlreadyChanged = false,
    } = {}) {
      const token = this.profileAnalyticsToken;
      this.profileAnalyticsToken = null;
      if (!token) return false;
      try {
        const options = { restore: restore === true };
        if (deferUntilNavigation === true) options.deferUntilNavigation = true;
        if (navigationAlreadyChanged === true) options.navigationAlreadyChanged = true;
        return this.analyticsPageReporter?.endVirtualPage?.(token, options) === true;
      } catch (_error) {
        return false;
      }
    },
    restoreProfileAnalyticsAfterNavigationFailure(token) {
      this.profileDialogVisible = false;
      this.profilePendingRouteName = null;
      try {
        return this.analyticsPageReporter?.restoreDeferredVirtualPage?.(token) === true;
      } catch (_error) {
        return false;
      }
    },
    showGuestProfileDialog() {
      this.guestProfileDialogVisible = true;
    },
    successGuestProfile() {
      this.guestProfileDialogVisible = false;
    },
    closeGuestProfileDialog() {
      this.guestProfileDialogVisible = false;
    },

    isHelpShortcutKey(event) {
      if (!event || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
        return false;
      }
      return event.key === '?' || (event.key === '/' && event.shiftKey) || (event.code === 'Slash' && event.shiftKey);
    },

    isEditableShortcutTarget(target) {
      if (!target || !target.tagName) return false;
      const tagName = target.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].indexOf(tagName) !== -1) return true;
      if (target.isContentEditable) return true;
      if (typeof target.closest === 'function') {
        return !!target.closest('[contenteditable="true"], [role="textbox"], .multiselect, .tag-group');
      }
      return false;
    },

    isDialogShortcutTarget(target) {
      return !!(target && typeof target.closest === 'function' && target.closest('[role="dialog"]'));
    },

    shouldIgnoreHelpShortcut(event) {
      const target = event && event.target ? event.target : document.activeElement;
      return (
        this.menuVisible ||
        this.profileDialogVisible ||
        this.guestProfileDialogVisible ||
        this.helpDialogVisible ||
        this.isEditableShortcutTarget(target) ||
        this.isDialogShortcutTarget(target)
      );
    },

    handleGlobalHelpShortcut(event) {
      if (!this.isHelpShortcutKey(event) || this.shouldIgnoreHelpShortcut(event)) return;
      event.preventDefault();
      this.openHelpDialog();
    },

    openHelpDialog() {
      this.helpDialogVisible = true;
    },

    closeHelpDialog() {
      this.helpDialogVisible = false;
    },
  },
};
</script>

<style scoped>
.skip-link {
  position: absolute;
  top: -40px;
  inset-inline-start: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
  transition: top 0.3s ease;
}
.skip-link:focus {
  top: 0;
}

header {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px;
  background-color: #000000;
}
#app_title {
  color: #ffffff !important;
  font-size: 20px;
}
.iseee {
  font-weight: bold;
}
.header-item {
  display: flex;
  align-items: center;
  width: 100%;
}
.avatar-content {
  margin-inline-start: auto;
}
.profile-button,
.guest-profile-button {
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  margin: 0 6px;
  color: #fff;
}
</style>
