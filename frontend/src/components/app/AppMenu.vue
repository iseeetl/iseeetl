<template>
  <nav role="navigation" :aria-label="$t('メインメニュー')">
    <UiButton
      id="app_menu_button"
      class="app-menu__trigger"
      data-testid="app-menu-button"
      icon-only
      :aria-label="$t('メニュー')"
      :aria-controls="menuVisible ? 'app_menu' : null"
      :aria-expanded="menuVisible ? 'true' : 'false'"
      @click="openMenu"
    >
      <UiIcon name="menu" />
    </UiButton>

    <UiDrawer
      v-if="menuVisible"
      class="app-menu"
      :open="menuVisible"
      title-id="app_menu_title"
      panel-id="app_menu"
      panel-test-id="app-menu"
      backdrop-test-id="app-menu-backdrop"
      initial-focus=".app-menu__item"
      @request-close="closeAppMenu"
    >
      <template #title>
        <h2 id="app_menu_title" class="app-menu__title">
          {{ $t('メニュー') }}
        </h2>
      </template>

      <p v-if="logoutError" role="alert">{{ $t('ネットワーク接続を確認してから、再試行してください。') }}</p>
      <ul class="app-menu__list" data-testid="app-menu-general-list">
        <li v-if="!userIsLogin">
          <router-link
            :to="buildMenuDestination({ name: 'Login' })"
            class="app-menu__item"
            data-testid="app-menu-login"
            @click="closeAppMenu"
          >
            <UiIcon class="app-menu__item-icon" name="login" />
            <span class="app-menu__item-text">{{ $t('ログイン') }}</span>
          </router-link>
        </li>

        <li>
          <router-link :to="{ name: 'Floor' }" class="app-menu__item" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="view_list" />
            <span class="app-menu__item-text">{{ $t('フロア一覧') }}</span>
          </router-link>
        </li>

        <li v-if="userIsLogin">
          <button
            type="button"
            class="app-menu__item"
            data-testid="app-menu-profile"
            @click="clickProfileButton"
          >
            <UiIcon class="app-menu__item-icon" name="person" />
            <span class="app-menu__item-text">{{ $t('プロフィール') }}</span>
          </button>
        </li>

        <li>
          <router-link :to="{ name: 'Tutorial' }" class="app-menu__item" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="school" />
            <span class="app-menu__item-text">{{ $t('チュートリアル') }}</span>
          </router-link>
        </li>

        <li>
          <router-link
            :to="{ name: 'Help' }"
            class="app-menu__item"
            data-testid="app-menu-help"
            @click="closeAppMenu"
          >
            <UiIcon class="app-menu__item-icon" name="help_outline" />
            <span class="app-menu__item-text">{{ $t('ヘルプ') }}</span>
          </router-link>
        </li>

        <li>
          <router-link
            :to="buildMenuDestination({ name: 'Terms' })"
            class="app-menu__item"
            @click="closeAppMenu"
          >
            <UiIcon class="app-menu__item-icon" name="gavel" />
            <span class="app-menu__item-text">{{ $t('利用許諾・著作権・禁止事項・免責事項') }}</span>
          </router-link>
        </li>

        <li>
          <router-link
            :to="buildMenuDestination({ name: 'Privacy' })"
            class="app-menu__item"
            @click="closeAppMenu"
          >
            <UiIcon class="app-menu__item-icon" name="verified_user" />
            <span class="app-menu__item-text">{{ $t('プライバシーポリシー') }}</span>
          </router-link>
        </li>

        <li>
          <router-link
            :to="buildMenuDestination({ name: 'CookiePolicy' })"
            class="app-menu__item"
            data-testid="app-menu-cookie-policy"
            @click="closeAppMenu"
          >
            <UiIcon class="app-menu__item-icon" name="policy" />
            <span class="app-menu__item-text">{{ $t('Cookieポリシー') }}</span>
          </router-link>
        </li>

        <li>
          <router-link :to="{ name: 'Accessibility' }" class="app-menu__item" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="accessibility_new" />
            <span class="app-menu__item-text">{{ $t('アクセシビリティ') }}</span>
          </router-link>
        </li>

        <li>
          <router-link :to="{ name: 'Contact' }" class="app-menu__item" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="contact_support" />
            <span class="app-menu__item-text">{{ $t('お問い合わせ') }}</span>
          </router-link>
        </li>

        <li>
          <router-link :to="{ name: 'Setting' }" class="app-menu__item" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="settings" />
            <span class="app-menu__item-text">{{ $t('設定') }}</span>
          </router-link>
        </li>

        <li v-if="userIsLogin">
          <button type="button" class="app-menu__item" data-testid="app-menu-logout" :disabled="logoutPending" :aria-busy="logoutPending" @click="clickLogoutButton">
            <UiIcon class="app-menu__item-icon" name="exit_to_app" />
            <span class="app-menu__item-text">{{ $t('ログアウト') }}</span>
          </button>
        </li>
      </ul>

      <section
        v-if="$store.getters.userRole === 'Administrator'"
        class="app-menu__administrator-section"
        aria-labelledby="app_menu_administrator_title"
        data-testid="app-menu-administrator-section"
      >
        <h3 id="app_menu_administrator_title" class="app-menu__section-title">
          {{ $t('管理者メニュー') }}
        </h3>

        <ul class="app-menu__list" data-testid="app-menu-administrator-list">
          <li>
            <router-link
              :to="{ name: 'UserManagement' }"
              class="app-menu__item"
              data-testid="app-menu-user-management"
              @click="closeAppMenu"
            >
              <UiIcon class="app-menu__item-icon" name="manage_accounts" />
              <span class="app-menu__item-text">{{ $t('ユーザ管理') }}</span>
            </router-link>
          </li>

          <li class="app-menu__group-start">
            <router-link
              :to="{ name: 'FloorManagement' }"
              class="app-menu__item"
              data-testid="app-menu-floor-management"
              @click="closeAppMenu"
            >
              <UiIcon class="app-menu__item-icon" name="layers" />
              <span class="app-menu__item-text">{{ $t('フロア管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link :to="{ name: 'FloorMemberManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="group" />
              <span class="app-menu__item-text">{{ $t('フロアメンバー管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link
              :to="{ name: 'RoomManagement' }"
              class="app-menu__item"
              data-testid="app-menu-room-management"
              @click="closeAppMenu"
            >
              <UiIcon class="app-menu__item-icon" name="meeting_room" />
              <span class="app-menu__item-text">{{ $t('ルーム管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link :to="{ name: 'RoomMemberManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="group" />
              <span class="app-menu__item-text">{{ $t('ルームメンバー管理') }}</span>
            </router-link>
          </li>

          <li class="app-menu__group-start">
            <router-link :to="{ name: 'PostManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="comment" />
              <span class="app-menu__item-text">{{ $t('投稿管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link :to="{ name: 'SpamManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="report_problem" />
              <span class="app-menu__item-text">{{ $t('スパム管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link :to="{ name: 'QuickTextManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="text_snippet" />
              <span class="app-menu__item-text">{{ $t('単語管理') }}</span>
            </router-link>
          </li>

          <li class="app-menu__group-start">
            <router-link :to="{ name: 'CategoryTagManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="tag" />
              <span class="app-menu__item-text">{{ $t('共通タグ管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link
              :to="{ name: 'FloorTagManagement' }"
              class="app-menu__item"
              data-testid="app-menu-floor-tag-management"
              @click="closeAppMenu"
            >
              <UiIcon class="app-menu__item-icon" name="tag" />
              <span class="app-menu__item-text">{{ $t('フロアタグ管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link :to="{ name: 'RoomTagManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="tag" />
              <span class="app-menu__item-text">{{ $t('ルームタグ管理') }}</span>
            </router-link>
          </li>

          <li>
            <router-link
              :to="{ name: 'AIAnalysisSettingManagement' }"
              class="app-menu__item"
              data-testid="app-menu-ai-analysis-settings"
              @click="closeAppMenu"
            >
              <UiIcon class="app-menu__item-icon" name="smart_toy" />
              <span class="app-menu__item-text">{{ $t('aiAnalysisSettings.menu') }}</span>
            </router-link>
          </li>

          <li class="app-menu__group-start">
            <router-link :to="{ name: 'TimelineDataManagement' }" class="app-menu__item" @click="closeAppMenu">
              <UiIcon class="app-menu__item-icon" name="storage" />
              <span class="app-menu__item-text">{{ $t('タイムラインデータ管理') }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <template #actions>
        <div class="app-menu__footer" data-testid="app-menu-footer">
          <button type="button" class="app-menu__item" data-testid="app-menu-close" @click="closeAppMenu">
            <UiIcon class="app-menu__item-icon" name="close" />
            <span class="app-menu__item-text">{{ $t('メニューを閉じる') }}</span>
          </button>
        </div>
      </template>
    </UiDrawer>
  </nav>
</template>

<script>
import { mapState } from 'vuex';
import UiButton from '@/components/ui/UiButton.vue';
import UiDrawer from '@/components/ui/UiDrawer.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import { withRoomContextQuery } from '@/utils/routeRoomContext';

export default {
  emits: ['open-profile', 'update:menuVisible'],
  name: 'AppMenu',
  components: {
    UiButton,
    UiDrawer,
    UiIcon,
  },
  props: {
    menuVisible: {
      type: Boolean,
      default: false,
    },
  },
  data: () => ({ logoutPending: false, logoutError: false }),
  computed: {
    ...mapState({
      userIsLogin: (state) => state.user.isLogin,
    }),
  },
  methods: {
    openMenu() {
      if (!this.menuVisible) {
        this.$emit('update:menuVisible', true);
      }
    },

    closeAppMenu() {
      if (this.menuVisible) {
        this.$emit('update:menuVisible', false);
      }
    },

    clickProfileButton() {
      this.closeAppMenu();
      this.$nextTick(() => {
        this.$emit('open-profile');
      });
    },

    async clickLogoutButton() {
      if (this.logoutPending) return;
      this.logoutPending = true;
      this.logoutError = false;
      try {
        const result = await this.$store.dispatch('doLogout');
        if (result === null) return;
        this.closeAppMenu();
        this.$store.dispatch('doShowSnackbar', { message: this.$t('ログアウトしました') });
        if (this.$route.name !== 'Floor') await this.$router.push({ name: 'Floor' });
      } catch {
        this.logoutError = true;
      } finally { this.logoutPending = false; }
    },

    buildMenuDestination(destination, options) {
      return withRoomContextQuery(destination, this.$route, options);
    },
  },
};
</script>

<style scoped>
.app-menu__trigger {
  color: #fff;
}

.app-menu__title {
  margin: 0;
  font-size: 20px;
  font-weight: normal;
}

.app-menu__list {
  flex-shrink: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.app-menu__administrator-section {
  flex-shrink: 0;
  border-block-start: 1px solid #ddd;
}

.app-menu__section-title {
  padding: 16px 16px 8px;
  margin: 0;
  color: rgba(0, 0, 0, 0.7);
  font-size: 14px;
  font-weight: 600;
}

.app-menu__group-start {
  margin-block-start: 8px;
}

.app-menu__footer {
  flex-shrink: 0;
  padding-block: 8px;
  margin-block-start: auto;
  border-block-start: 1px solid #ddd;
}

.app-menu__item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  color: #000 !important;
  background: transparent;
  font: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
}

.app-menu__item:visited,
.app-menu__item:hover,
.app-menu__item:focus {
  color: #000 !important;
  text-decoration: none;
}

.app-menu__item:hover,
.app-menu__item:focus-visible {
  background: #f0f0f0;
}

.app-menu__item-icon {
  margin-inline-end: 10px;
  color: rgba(0, 0, 0, 0.54);
}

.app-menu__item-text {
  flex-grow: 1;
}
</style>
