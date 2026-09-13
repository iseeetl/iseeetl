import { expect } from 'vitest';
import { reactive } from 'vue';
import { setTestRoute, shallowMount } from './helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import App from '@/App.vue';
import { isPlannedPageLeave, resetPlannedPageLeave } from '@/utils/plannedPageLeave';


const baseStubs = {
  AppMenu: true,
  UiSnackbar: true,
  ProfileDialog: true,
  GuestProfileDialog: true,
  HelpDialog: true,
  UiAvatar: true,
  UiButton: true,
  UiIcon: true,
  'router-link': true,
};

const createStoreMock = (overrides = {}) => {
  const getters = {
    lang: null,
    snackbarVisible: false,
    snackbarPosition: 'center',
    snackbarIsInfinity: false,
    snackbarDuration: 1000,
    snackbarMessage: '',
    inertAppContainer: false,
    politeMessage: '',
    assertiveMessage: '',
    userId: null,
    userImageName: null,
    guestId: null,
    ...overrides.getters,
  };
  return {
    getters,
    state: {
      user: {
        isLogin: false,
        imageName: null,
        ...(overrides.stateUser || {}),
      },
    },
    dispatch: overrides.dispatch || (() => {}),
  };
};

const createRouter = (route = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Home', component: {} },
      { path: '/floor/:floor_id/room/:room_id', name: 'Room', component: {} },
      { path: '/changepassword', name: 'ChangePassword', component: {} },
    ],
  });
  const location = route.name
    ? { name: route.name, params: route.params || {}, query: route.query || {} }
    : { path: route.path || '/', query: route.query || {} };
  return setTestRoute(router, location);
};

const createAnalyticsPageReporter = () => {
  const token = Object.freeze({});
  return {
    token,
    beginVirtualPage: vi.fn(() => token),
    endVirtualPage: vi.fn(() => true),
    restoreDeferredVirtualPage: vi.fn(() => true),
  };
};

const createWrapper = (overrides = {}) =>
  shallowMount(App, {
    router: overrides.router || createRouter(overrides.route || {}),
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $i18n: overrides.i18n || { locale: 'en' },
      $t: overrides.translate || ((key) => key),
    },
    provide: overrides.provide || {},
  });

const applyNavigator = (values) => {
  const props = ['userAgent', 'languages', 'language', 'userLanguage', 'browserLanguage'];
  const originals = {};
  props.forEach((key) => {
    originals[key] = Object.getOwnPropertyDescriptor(window.navigator, key);
  });
  props.forEach((key) => {
    if (key in values) {
      Object.defineProperty(window.navigator, key, {
        value: values[key],
        configurable: true,
      });
    }
  });
  return () => {
    props.forEach((key) => {
      const original = originals[key];
      if (original) {
        Object.defineProperty(window.navigator, key, original);
      }
    });
  };
};

describe('アプリ全体の表示と操作（App）', () => {
  afterEach(() => {
    resetPlannedPageLeave();
  });

  it('アプリメニューの更新イベントをルートの表示状態へ反映する', async () => {
    const wrapper = createWrapper({
      stubs: {
        AppMenu: false,
        UiButton: false,
      },
    });
    const menu = wrapper.findComponent({ name: 'AppMenu' });

    await wrapper.find('[data-testid="app-menu-button"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.menuVisible).to.equal(true);
    expect(menu.props('menuVisible')).to.equal(true);
    expect(wrapper.findComponent({ name: 'UiDrawer' }).props()).to.include({
      open: true,
      panelTestId: 'app-menu',
    });
  });

  it('アプリメニューのプロフィール操作で共通ダイアログを開く', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    const menu = wrapper.findComponent({ name: 'AppMenu' });
    const dialog = wrapper.findComponent({ name: 'ProfileDialog' });

    expect(dialog.props('dialogVisible')).to.equal(false);
    menu.vm.$emit('open-profile');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.profileDialogVisible).to.equal(true);
    expect(dialog.props('dialogVisible')).to.equal(true);
    expect(analyticsPageReporter.beginVirtualPage).toHaveBeenCalledOnce();
    expect(analyticsPageReporter.beginVirtualPage).toHaveBeenCalledWith('Profile');
  });

  it('ログイン中のヘッダのアバターからプロフィールダイアログを開ける', async () => {
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      stubs: { UiButton: false },
    });
    const button = wrapper.get('[data-testid="app-profile-button"]');

    expect(button.element.tagName).to.equal('BUTTON');
    await button.trigger('click');

    expect(wrapper.vm.profileDialogVisible).to.equal(true);
  });

  it('プロフィールのclose・successイベントでダイアログを閉じる', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    const dialog = wrapper.findComponent({ name: 'ProfileDialog' });

    wrapper.vm.showProfileDialog();
    await wrapper.vm.$nextTick();
    dialog.vm.$emit('close');
    expect(wrapper.vm.profileDialogVisible).to.equal(false);
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenLastCalledWith(
      analyticsPageReporter.token,
      { restore: true }
    );

    wrapper.vm.showProfileDialog();
    await wrapper.vm.$nextTick();
    dialog.vm.$emit('success');
    expect(wrapper.vm.profileDialogVisible).to.equal(false);
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledOnce();
    dialog.vm.$emit('close');
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledTimes(2);
  });

  it('プロフィールからパスワード変更へ進む際はダイアログのclosed後に遷移する', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    const pushes = [];
    wrapper.vm.$router.push = (destination) => {
      pushes.push(destination);
      return Promise.resolve();
    };

    wrapper.vm.showProfileDialog();
    wrapper.vm.changePassword();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.profileDialogVisible).to.equal(false);
    expect(wrapper.vm.profilePendingRouteName).to.equal('ChangePassword');
    expect(pushes).to.deep.equal([]);

    wrapper.vm.closeProfileDialog();

    expect(wrapper.vm.profilePendingRouteName).to.equal(null);
    expect(pushes).to.deep.equal([{ name: 'ChangePassword' }]);
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token,
      { restore: false, deferUntilNavigation: true }
    );
  });

  it('パスワード変更画面ではプロフィールを閉じた後に背面の計測状態へ戻す', () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      route: { name: 'ChangePassword' },
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    const push = vi.spyOn(wrapper.vm.$router, 'push');

    wrapper.vm.showProfileDialog();
    wrapper.vm.changePassword();
    wrapper.vm.closeProfileDialog();

    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token,
      { restore: true }
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('プロフィール表示中の画面遷移では遷移結果が決まるまで計測を終了しない', () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });

    wrapper.vm.showProfileDialog();
    wrapper.vm.$options.watch['$route.fullPath'].call(wrapper.vm);

    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token,
      {
        restore: false,
        deferUntilNavigation: true,
        navigationAlreadyChanged: true,
      }
    );
  });

  it('計測トークンがなくても画面遷移時にプロフィールを閉じる', () => {
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
    });
    wrapper.vm.profileDialogVisible = true;
    wrapper.vm.profilePendingRouteName = 'ChangePassword';

    wrapper.vm.$options.watch['$route.fullPath'].call(wrapper.vm);

    expect(wrapper.vm.profileDialogVisible).to.equal(false);
    expect(wrapper.vm.profilePendingRouteName).to.equal(null);
  });

  it('パスワード変更画面への遷移で例外が発生した場合は背面の計測を復旧する', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    wrapper.vm.$router.push = vi.fn(() => Promise.reject(new Error('route load failed')));

    wrapper.vm.showProfileDialog();
    wrapper.vm.changePassword();
    wrapper.vm.closeProfileDialog();
    await Promise.resolve();
    await Promise.resolve();

    expect(analyticsPageReporter.restoreDeferredVirtualPage).toHaveBeenCalledOnce();
    expect(analyticsPageReporter.restoreDeferredVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token
    );
    expect(wrapper.vm.profileDialogVisible).to.equal(false);
    expect(wrapper.vm.profilePendingRouteName).to.equal(null);
  });

  it('パスワード変更画面への遷移が失敗として解決した場合も背面の計測を復旧する', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });
    wrapper.vm.$router.push = vi.fn(() => Promise.resolve({ type: 'aborted' }));

    wrapper.vm.showProfileDialog();
    wrapper.vm.changePassword();
    wrapper.vm.closeProfileDialog();
    await Promise.resolve();
    await Promise.resolve();

    expect(analyticsPageReporter.restoreDeferredVirtualPage).toHaveBeenCalledOnce();
    expect(analyticsPageReporter.restoreDeferredVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token
    );
  });

  it('ログアウトでは背面の計測を復元し、アンマウントでは仮想ページの計測だけを終了する', async () => {
    const analyticsPageReporter = createAnalyticsPageReporter();
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
      provide: { analyticsPageReporter },
    });

    wrapper.vm.showProfileDialog();
    wrapper.vm.$options.watch.userIsLogin.call(wrapper.vm, false);
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledWith(
      analyticsPageReporter.token,
      { restore: true }
    );

    wrapper.vm.showProfileDialog();
    wrapper.unmount();
    expect(analyticsPageReporter.endVirtualPage).toHaveBeenCalledTimes(2);
    expect(analyticsPageReporter.endVirtualPage.mock.calls[1][1]).to.deep.equal({
      restore: false,
    });
  });

  it('トップリンクとページライフサイクルで計画的離脱状態を管理する', () => {
    const wrapper = createWrapper();
    const link = wrapper.find('#app_title').element;

    wrapper.vm.handleAppTitleClick({
      button: 0,
      currentTarget: link,
    });
    expect(isPlannedPageLeave()).to.equal(true);

    wrapper.vm.handlePageShow();
    expect(isPlannedPageLeave()).to.equal(false);

    wrapper.vm.handleAppTitleClick({
      button: 0,
      ctrlKey: true,
      currentTarget: link,
    });
    expect(isPlannedPageLeave()).to.equal(false);

    wrapper.vm.handlePageHide();
    expect(isPlannedPageLeave()).to.equal(true);
    wrapper.vm.handlePageShow();
  });

  it('登録したwindowのリスナーをアンマウント時に解除する', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const wrapper = createWrapper();
    const fillHeightHandler = wrapper.vm.setFillHeight;

    expect(addListener.mock.calls.some(([type, handler]) => type === 'load' && handler === fillHeightHandler)).to.equal(
      true
    );
    expect(
      addListener.mock.calls.some(([type, handler]) => type === 'resize' && handler === fillHeightHandler)
    ).to.equal(true);

    wrapper.unmount();

    expect(
      removeListener.mock.calls.some(([type, handler]) => type === 'load' && handler === fillHeightHandler)
    ).to.equal(true);
    expect(
      removeListener.mock.calls.some(([type, handler]) => type === 'resize' && handler === fillHeightHandler)
    ).to.equal(true);
  });

  it('クローラ判定時は日本語に固定する', () => {
    const restore = applyNavigator({
      userAgent: 'Googlebot',
      languages: ['fr'],
      language: 'fr',
      userLanguage: 'fr',
      browserLanguage: 'fr',
    });
    const dispatchCalls = [];
    const store = createStoreMock({
      getters: { lang: null },
      dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
    });

    const wrapper = createWrapper({ store, i18n: { locale: 'en' } });

    expect(wrapper.vm.$i18n.locale).to.equal('ja');
    expect(dispatchCalls.some((call) => call.type === 'doLoadState')).to.equal(false);
    expect(dispatchCalls.some((call) => call.type === 'doSetLang')).to.equal(false);

    restore();
  });

  it('言語未設定時はブラウザ言語を採用し、無効なら英語にする', () => {
    const restore = applyNavigator({
      userAgent: 'Mozilla/5.0',
      languages: ['xx-YY'],
      language: 'xx-YY',
      userLanguage: 'xx-YY',
      browserLanguage: 'xx-YY',
    });
    const dispatchCalls = [];
    const store = createStoreMock({
      getters: { lang: null },
      dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
    });

    const wrapper = createWrapper({ store, i18n: { locale: 'ja' } });

    expect(wrapper.vm.$i18n.locale).to.equal('en');
    const setLang = dispatchCalls.find((call) => call.type === 'doSetLang');
    expect(setLang.payload).to.deep.equal({ lang: 'en' });

    restore();
  });

  it('ストアに言語がある場合はそれを採用する', () => {
    const restore = applyNavigator({
      userAgent: 'Mozilla/5.0',
      languages: ['ja'],
      language: 'ja',
      userLanguage: 'ja',
      browserLanguage: 'ja',
    });
    const dispatchCalls = [];
    const store = createStoreMock({
      getters: { lang: 'sv' },
      dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
    });

    const wrapper = createWrapper({ store, i18n: { locale: 'en' } });

    expect(wrapper.vm.$i18n.locale).to.equal('sv');
    expect(dispatchCalls.some((call) => call.type === 'doSetLang')).to.equal(false);

    restore();
  });

  it('保存済みの言語が不正ならブラウザの言語へ補正して保存する', () => {
    const restore = applyNavigator({ userAgent: 'Mozilla/5.0', languages: ['de-DE'], language: 'de-DE' });
    const dispatchCalls = [];
    const store = createStoreMock({
      getters: { lang: 'invalid-locale' },
      dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
    });

    const wrapper = createWrapper({ store, i18n: { locale: 'ja' } });

    expect(wrapper.vm.$i18n.locale).to.equal('de');
    expect(dispatchCalls).to.deep.include({ type: 'doSetLang', payload: { lang: 'de' } });
    restore();
  });

  it('初期言語と実行中の言語変更をhtmlのlangへ同期し、画面方向はLTRを維持する', async () => {
    const originalLanguage = document.documentElement.getAttribute('lang');
    const originalDirection = document.documentElement.getAttribute('dir');
    const restoreNavigator = applyNavigator({
      userAgent: 'Mozilla/5.0',
      languages: ['fr'],
      language: 'fr',
      userLanguage: 'fr',
      browserLanguage: 'fr',
    });
    const i18n = reactive({ locale: 'fr' });
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { lang: 'fr' } }),
      i18n,
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$i18n.locale).to.equal('fr');
    expect(document.documentElement.getAttribute('lang')).to.equal('fr');
    expect(document.documentElement.getAttribute('dir')).to.equal('ltr');

    i18n.locale = 'he';
    await wrapper.vm.$nextTick();
    expect(document.documentElement.getAttribute('lang')).to.equal('he');
    expect(document.documentElement.getAttribute('dir')).to.equal('ltr');

    i18n.locale = 'de';
    await wrapper.vm.$nextTick();
    expect(document.documentElement.getAttribute('dir')).to.equal('ltr');

    if (originalLanguage === null) document.documentElement.removeAttribute('lang');
    else document.documentElement.setAttribute('lang', originalLanguage);
    if (originalDirection === null) document.documentElement.removeAttribute('dir');
    else document.documentElement.setAttribute('dir', originalDirection);
    restoreNavigator();
  });

  it('言語変更時に現在のページの文書タイトルを再翻訳する', async () => {
    const originalTitle = document.title;
    const i18n = reactive({ locale: 'en' });
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { lang: 'en' } }),
      i18n,
      translate: (key) => `${i18n.locale}:${key}`,
    });

    i18n.locale = 'en';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.title).to.equal('en:アイシータイムライン');

    i18n.locale = 'he';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.title).to.equal('he:アイシータイムライン');

    document.title = originalTitle;
  });

  it('politeとassertiveの通知を別々のライブリージョンで公開する', () => {
    const wrapper = createWrapper({
      store: createStoreMock({
        getters: {
          politeMessage: '読み込みが完了しました',
          assertiveMessage: '入力内容を確認してください',
        },
      }),
    });
    const polite = wrapper.find('[role="status"][aria-live="polite"]');
    const assertive = wrapper.find('[role="alert"][aria-live="assertive"]');

    expect(polite.exists()).to.equal(true);
    expect(polite.text()).to.equal('読み込みが完了しました');
    expect(assertive.exists()).to.equal(true);
    expect(assertive.text()).to.equal('入力内容を確認してください');
    expect(wrapper.findAll('[aria-live="polite"]')).to.have.lengthOf(1);
    expect(wrapper.findAll('[aria-live="assertive"]')).to.have.lengthOf(1);
  });

  it('snackbarActiveProxy を false にすると doHideSnackbar を dispatch する', async () => {
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        getters: { snackbarVisible: true },
        dispatch: (type) => dispatchCalls.push(type),
      }),
    });

    wrapper.vm.snackbarActiveProxy = false;
    await wrapper.vm.$nextTick();

    expect(dispatchCalls).to.include('doHideSnackbar');
  });

  it('ルート画面を単一のmain要素内に描画する', () => {
    const wrapper = createWrapper();

    expect(wrapper.findAll('main#app_content')).to.have.lengthOf(1);
    expect(wrapper.find('main#app_content').find('router-view-stub').exists()).to.equal(true);
  });

  it('同じルームの投稿詳細では画面を再利用し、ルーム変更時だけキーを変える', () => {
    const computeKey = App.computed.routeViewKey;
    const roomA = computeKey.call({
      $route: {
        name: 'TimeLine',
        params: { floor_id: 'floor-a', room_id: 'room-a' },
      },
    });
    const roomADetail = computeKey.call({
      $route: {
        name: 'TimeLinePostDetail',
        params: { floor_id: 'floor-a', room_id: 'room-a', post_id: 'post-a' },
      },
    });
    const roomB = computeKey.call({
      $route: {
        name: 'TimeLine',
        params: { floor_id: 'floor-a', room_id: 'room-b' },
      },
    });

    expect(roomA).to.equal('timeline:floor-a:room-a');
    expect(roomADetail).to.equal(roomA);
    expect(roomB).not.to.equal(roomA);
  });

  it('フロア一覧の画面キーをフロアIDごとに変える', () => {
    const computeKey = App.computed.routeViewKey;
    const floorA = computeKey.call({
      $route: { name: 'Room', params: { floor_id: 'floor-a' } },
    });
    const floorB = computeKey.call({
      $route: { name: 'Room', params: { floor_id: 'floor-b' } },
    });

    expect(floorA).to.equal('room-list:floor-a');
    expect(floorB).to.equal('room-list:floor-b');
  });

  it('ヘルプ表示時の背面操作の制限を共通ダイアログ管理へ委ねる', async () => {
    const wrapper = createWrapper();

    wrapper.vm.helpDialogVisible = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('header').attributes('inert')).to.equal(undefined);
    expect(wrapper.find('header').attributes('aria-hidden')).to.equal(undefined);
    expect(wrapper.find('main#app_content').attributes('inert')).to.equal(undefined);
    expect(wrapper.find('main#app_content').attributes('aria-hidden')).to.equal(undefined);
  });

  it('isArMode はクエリの armode を参照する', () => {
    const wrapper = createWrapper({ route: { query: { armode: 'on' }, params: {} } });
    expect(wrapper.vm.isArMode).to.equal(true);
  });

  it('ゲストプロフィールを閉じるときのフォーカス復帰をUiDialogへ委ねる', async () => {
    const wrapper = createWrapper();
    const focusTarget = {
      focusCalled: false,
      focus() {
        this.focusCalled = true;
      },
    };

    wrapper.vm.showGuestProfileDialog({ currentTarget: focusTarget });
    wrapper.vm.closeGuestProfileDialog();
    await wrapper.vm.$nextTick();

    expect(focusTarget.focusCalled).to.equal(false);
    expect(wrapper.vm.guestProfileDialogVisible).to.equal(false);
  });

  it('?キーでログイン後にヘルプダイアログを開く', () => {
    const preventCalls = [];
    const focusTarget = document.createElement('button');
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
    });

    wrapper.vm.handleGlobalHelpShortcut({
      key: '?',
      target: focusTarget,
      preventDefault: () => preventCalls.push(true),
    });

    expect(preventCalls).to.deep.equal([true]);
    expect(wrapper.vm.helpDialogVisible).to.equal(true);
  });

  it('?キーは未ログインでもヘルプダイアログを開く', () => {
    const preventCalls = [];
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: false } }),
    });

    wrapper.vm.handleGlobalHelpShortcut({
      key: '?',
      target: document.createElement('button'),
      preventDefault: () => preventCalls.push(true),
    });

    expect(preventCalls).to.deep.equal([true]);
    expect(wrapper.vm.helpDialogVisible).to.equal(true);
  });

  it('?キーは入力中にはヘルプダイアログを開かない', () => {
    const input = document.createElement('input');
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
    });

    wrapper.vm.handleGlobalHelpShortcut({
      key: '?',
      target: input,
      preventDefault: () => {},
    });

    expect(wrapper.vm.helpDialogVisible).to.equal(false);
  });

  it('?キーはプロフィールダイアログ表示中にはヘルプダイアログを開かない', () => {
    const wrapper = createWrapper({
      store: createStoreMock({ stateUser: { isLogin: true } }),
    });
    wrapper.vm.profileDialogVisible = true;

    wrapper.vm.handleGlobalHelpShortcut({
      key: '?',
      target: document.createElement('button'),
      preventDefault: () => {},
    });

    expect(wrapper.vm.helpDialogVisible).to.equal(false);
  });

  it('ヘルプを閉じるときのフォーカス復帰をUiDialogへ委ねる', async () => {
    const wrapper = createWrapper();
    const focusTarget = {
      focusCalled: false,
      focus() {
        this.focusCalled = true;
      },
    };

    wrapper.vm.openHelpDialog(focusTarget);
    wrapper.vm.closeHelpDialog();
    await wrapper.vm.$nextTick();

    expect(focusTarget.focusCalled).to.equal(false);
    expect(wrapper.vm.helpDialogVisible).to.equal(false);
  });
});
