import { expect, vi } from 'vitest';
import { setTestRoute, shallowMount } from '../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import AppMenu from '@/components/app/AppMenu.vue';

const mountedWrappers = [];

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['iconOnly'],
  template: '<button v-bind="$attrs" type="button"><slot /></button>',
  methods: {
    focus() {
      this.$el.focus();
    },
  },
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<span>{{ name }}</span>',
};

const UiDrawerStub = {
  name: 'UiDrawer',
  inheritAttrs: false,
  emits: ['request-close'],
  props: [
    'open',
    'titleId',
    'initialFocus',
    'closeOnEscape',
    'closeOnBackdrop',
    'panelId',
    'panelTestId',
    'backdropTestId',
  ],
  template: `
    <template v-if="open">
      <div :data-testid="backdropTestId" aria-hidden="true" @click="$emit('request-close')" />
      <aside
        v-bind="$attrs"
        :id="panelId"
        :data-testid="panelTestId"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <slot name="title" />
        <slot />
        <slot name="actions" />
      </aside>
    </template>
  `,
};

const RouterLinkStub = {
  name: 'RouterLink',
  inheritAttrs: false,
  props: ['to'],
  template: '<a v-bind="$attrs" href="#"><slot /></a>',
};

const createStoreMock = (overrides = {}) => ({
  state: {
    user: {
      isLogin: false,
      ...(overrides.state && overrides.state.user ? overrides.state.user : {}),
    },
  },
  getters: {
    userRole: 'User',
    ...(overrides.getters || {}),
  },
  dispatch: overrides.dispatch || (() => Promise.resolve()),
});

const createRouter = (route = { name: 'Floor' }) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Floor', component: {} },
      { path: '/login', name: 'Login', component: {} },
      { path: '/register', name: 'Register', component: {} },
      { path: '/terms', name: 'Terms', component: {} },
      { path: '/privacy', name: 'Privacy', component: {} },
      { path: '/cookie', name: 'CookiePolicy', component: {} },
      { path: '/help', name: 'Help', component: {} },
      { path: '/timeline/:floor_id/:room_id', name: 'TimeLine', component: {} },
      { path: '/floor/:floor_id/room/:room_id', name: 'FloorRoom', component: {} },
    ],
  });
  return setTestRoute(router, route);
};

const createWrapper = (overrides = {}) => {
  const router = overrides.router || createRouter(overrides.route);
  const store = overrides.store || createStoreMock(overrides.storeOverrides || {});
  const wrapper = shallowMount(AppMenu, {
    attachTo: document.body,
    router,
    props: {
      menuVisible: false,
      ...(overrides.props || {}),
    },
    stubs: {
      UiButton: UiButtonStub,
      UiDrawer: UiDrawerStub,
      UiIcon: UiIconStub,
      'router-link': RouterLinkStub,
      ...(overrides.stubs || {}),
    },
    mocks: {
      $store: store,
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const getIconNamesByRoute = (wrapper) =>
  Object.fromEntries(
    wrapper.findAllComponents(RouterLinkStub).map((link) => [
      link.props('to')?.name,
      link.findComponent(UiIconStub).props('name'),
    ])
  );

const getRouteNamesWithin = (wrapper, selector) => {
  const container = wrapper.get(selector).element;
  return wrapper
    .findAllComponents(RouterLinkStub)
    .filter((link) => container.contains(link.element))
    .map((link) => link.props('to')?.name);
};

describe('アプリメニュー（AppMenu）', () => {
  afterEach(() => {
    while (mountedWrappers.length) {
      mountedWrappers.pop().unmount();
    }
  });

  it('openMenuはmenuVisibleをtrueで更新する', () => {
    const wrapper = createWrapper();

    wrapper.vm.openMenu();

    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([true]);
  });

  it('closeAppMenuはmenuVisibleをfalseで更新する', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });

    wrapper.vm.closeAppMenu();

    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
  });

  it('プロフィール操作はリンク遷移せず、メニューを閉じてからダイアログ表示を要求する', async () => {
    const wrapper = createWrapper({
      props: { menuVisible: true },
      storeOverrides: { state: { user: { isLogin: true } } },
    });
    const profileButton = wrapper.get('[data-testid="app-menu-profile"]');

    expect(profileButton.element.tagName).to.equal('BUTTON');
    expect(
      wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to')?.name === 'Profile')
    ).to.equal(false);

    await profileButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
    expect(wrapper.emitted()['open-profile']).to.deep.equal([[]]);
  });

  it('メニューが開いている間だけトリガーから一意なダイアログを参照する', async () => {
    const wrapper = createWrapper();
    const trigger = wrapper.find('[data-testid="app-menu-button"]');

    expect(trigger.attributes('aria-expanded')).to.equal('false');
    expect(trigger.attributes('aria-controls')).to.equal(undefined);
    expect(document.querySelectorAll('#app_menu')).to.have.length(0);

    await wrapper.setProps({ menuVisible: true });

    expect(trigger.attributes('aria-expanded')).to.equal('true');
    expect(trigger.attributes('aria-controls')).to.equal('app_menu');
    expect(document.querySelectorAll('#app_menu')).to.have.length(1);
  });

  it('背景要素の後にaside要素のダイアログとしてメニューを描画する', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });
    const backdrop = wrapper.find('[data-testid="app-menu-backdrop"]');
    const menu = wrapper.find('[data-testid="app-menu"]');

    expect(backdrop.exists()).to.equal(true);
    expect(menu.element.tagName).to.equal('ASIDE');
    expect(menu.attributes('role')).to.equal('dialog');
    expect(menu.attributes('aria-modal')).to.equal('true');
    expect(menu.attributes('aria-labelledby')).to.equal('app_menu_title');
    expect(wrapper.find('#app_menu_title').element.tagName).to.equal('H2');
    expect(backdrop.element.nextElementSibling).to.equal(menu.element);
  });

  it('一般メニューは用途を区別できるアイコンを表示する', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });

    expect(getIconNamesByRoute(wrapper)).to.deep.include({
      Login: 'login',
      Tutorial: 'school',
      Terms: 'gavel',
      Accessibility: 'accessibility_new',
      Contact: 'contact_support',
    });
  });

  it('管理メニューは管理対象に応じたアイコンを表示する', () => {
    const wrapper = createWrapper({
      props: { menuVisible: true },
      storeOverrides: {
        state: { user: { isLogin: true } },
        getters: { userRole: 'Administrator' },
      },
    });

    expect(getIconNamesByRoute(wrapper)).to.deep.include({
      FloorManagement: 'layers',
      FloorMemberManagement: 'group',
      RoomManagement: 'meeting_room',
      RoomMemberManagement: 'group',
      UserManagement: 'manage_accounts',
      CategoryTagManagement: 'tag',
      FloorTagManagement: 'tag',
      RoomTagManagement: 'tag',
      SpamManagement: 'report_problem',
      QuickTextManagement: 'text_snippet',
    });
  });

  it('背景を押すとメニューを閉じる', async () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });

    await wrapper.find('[data-testid="app-menu-backdrop"]').trigger('click');

    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
  });

  it('管理者にだけ管理メニューを見出し付きで指定順に表示する', () => {
    const administrator = createWrapper({
      props: { menuVisible: true },
      storeOverrides: {
        state: { user: { isLogin: true } },
        getters: { userRole: 'Administrator' },
      },
    });
    const section = administrator.get('[data-testid="app-menu-administrator-section"]');

    expect(section.attributes('aria-labelledby')).to.equal('app_menu_administrator_title');
    expect(administrator.get('#app_menu_administrator_title').element.tagName).to.equal('H3');
    expect(administrator.get('#app_menu_administrator_title').text()).to.equal('管理者メニュー');
    expect(administrator.find('[data-testid="app-menu-ai-analysis-settings"]').exists()).to.equal(true);
    expect(getRouteNamesWithin(administrator, '[data-testid="app-menu-administrator-list"]')).to.deep.equal([
      'UserManagement',
      'FloorManagement',
      'FloorMemberManagement',
      'RoomManagement',
      'RoomMemberManagement',
      'PostManagement',
      'SpamManagement',
      'QuickTextManagement',
      'CategoryTagManagement',
      'FloorTagManagement',
      'RoomTagManagement',
      'AIAnalysisSettingManagement',
      'TimelineDataManagement',
    ]);

    const user = createWrapper({
      props: { menuVisible: true },
      storeOverrides: {
        state: { user: { isLogin: true } },
        getters: { userRole: 'User' },
      },
    });
    expect(user.find('[data-testid="app-menu-administrator-section"]').exists()).to.equal(false);
    expect(user.find('[data-testid="app-menu-ai-analysis-settings"]').exists()).to.equal(false);
  });

  it('通常項目、管理者項目、閉じる操作を分離し、閉じる操作を各ロールで末尾に置く', () => {
    const administrator = createWrapper({
      props: { menuVisible: true },
      storeOverrides: {
        state: { user: { isLogin: true } },
        getters: { userRole: 'Administrator' },
      },
    });
    const generalList = administrator.get('[data-testid="app-menu-general-list"]').element;
    const administratorSection = administrator.get('[data-testid="app-menu-administrator-section"]').element;
    const footer = administrator.get('[data-testid="app-menu-footer"]').element;

    expect(generalList.nextElementSibling).to.equal(administratorSection);
    expect(administratorSection.nextElementSibling).to.equal(footer);

    [
      ['guest', {}],
      ['user', { state: { user: { isLogin: true } }, getters: { userRole: 'User' } }],
      ['administrator', { state: { user: { isLogin: true } }, getters: { userRole: 'Administrator' } }],
    ].forEach(([role, storeOverrides]) => {
      const wrapper = createWrapper({
        props: { menuVisible: true },
        storeOverrides,
      });
      const items = wrapper.findAll('.app-menu__item');
      const closeButton = wrapper.get('[data-testid="app-menu-close"]').element;
      const menu = wrapper.get('[data-testid="app-menu"]').element;

      expect(items[items.length - 1].element, role).to.equal(closeButton);
      expect(menu.lastElementChild, role).to.equal(wrapper.get('[data-testid="app-menu-footer"]').element);
    });
  });

  it('管理者にもリクエストログの管理項目を表示しない', () => {
    const administrator = createWrapper({
      props: { menuVisible: true },
      storeOverrides: { getters: { userRole: 'Administrator' } },
    });
    const routeNames = administrator
      .findAllComponents(RouterLinkStub)
      .map((link) => link.props('to')?.name)
      .filter(Boolean);

    expect(routeNames).not.to.include('RequestLogManagement');
    expect(administrator.text()).not.to.include('ログ管理');
  });

  it('フォーカス・Escapeキー・背景の制御を共通ドロワーへ委ねる', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });
    const drawer = wrapper.findComponent(UiDrawerStub);

    expect(drawer.props()).to.include({
      open: true,
      titleId: 'app_menu_title',
      initialFocus: '.app-menu__item',
      panelId: 'app_menu',
      panelTestId: 'app-menu',
      backdropTestId: 'app-menu-backdrop',
    });

    drawer.vm.$emit('request-close', { reason: 'escape' });
    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
  });

  it('buildMenuDestinationは許可ルートにfloor_id/room_idを付与する', () => {
    const wrapper = createWrapper({
      route: { name: 'Floor', query: { floor_id: 'f1', room_id: 'r1' } },
    });

    const to = wrapper.vm.buildMenuDestination({ name: 'Terms', query: { keep: '1' } });

    expect(to).to.deep.equal({
      name: 'Terms',
      query: { keep: '1', floor_id: 'f1', room_id: 'r1' },
    });
  });

  it('buildMenuDestinationは既存クエリのfloor_id/room_idを上書きしない', () => {
    const wrapper = createWrapper({
      route: { name: 'Floor', query: { floor_id: 'f1', room_id: 'r1' } },
    });

    const to = wrapper.vm.buildMenuDestination({
      name: 'Privacy',
      query: { floor_id: 'keep-f', room_id: 'keep-r' },
    });

    expect(to).to.deep.equal({
      name: 'Privacy',
      query: { floor_id: 'keep-f', room_id: 'keep-r' },
    });
  });

  it('buildMenuDestinationは対象外ルートではクエリを追加しない', () => {
    const wrapper = createWrapper({
      route: { name: 'Floor', query: { floor_id: 'f1', room_id: 'r1' } },
    });

    const to = wrapper.vm.buildMenuDestination({ name: 'Floor' });

    expect(to).to.deep.equal({ name: 'Floor', query: undefined });
  });

  it('参照元がクエリの場合もパスからfloor_idとroom_idを補完する', () => {
    const wrapper = createWrapper({
      route: { name: 'FloorRoom', params: { floor_id: 'pf', room_id: 'pr' }, query: {} },
    });

    const to = wrapper.vm.buildMenuDestination({ name: 'Login' }, { source: 'query' });

    expect(to).to.deep.equal({
      name: 'Login',
      query: { floor_id: 'pf', room_id: 'pr' },
    });
  });

  it('フロア一覧以外ではログアウト後にフロア一覧へ移動する', async () => {
    const dispatchCalls = [];
    const wrapper = createWrapper({
      route: { name: 'Login' },
      props: { menuVisible: true },
      storeOverrides: {
        dispatch: (type) => dispatchCalls.push(type),
      },
    });
    const pushes = [];
    wrapper.vm.$router.push = (payload) => {
      pushes.push(payload);
    };

    await wrapper.vm.clickLogoutButton();

    expect(dispatchCalls).to.deep.equal(['doLogout', 'doShowSnackbar']);
    expect(pushes).to.deep.equal([{ name: 'Floor' }]);
    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
  });

  it('フロア一覧ではログアウト後に追加の画面遷移を行わない', async () => {
    const dispatchCalls = [];
    const wrapper = createWrapper({
      route: { name: 'Floor' },
      props: { menuVisible: true },
      storeOverrides: {
        dispatch: (type) => dispatchCalls.push(type),
      },
    });
    const pushes = [];
    wrapper.vm.$router.push = (payload) => {
      pushes.push(payload);
    };

    await wrapper.vm.clickLogoutButton();

    expect(dispatchCalls).to.deep.equal(['doLogout', 'doShowSnackbar']);
    expect(pushes).to.deep.equal([]);
  });

  it('メニュー項目を選択するとメニューを閉じる', async () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });

    await wrapper.find('[data-testid="app-menu-help"]').trigger('click');

    expect(wrapper.emitted()['update:menuVisible'][0]).to.deep.equal([false]);
  });

  it('ヘルプメニュー項目を表示する', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });

    expect(wrapper.find('[data-testid="app-menu-help"]').exists()).to.equal(true);
  });

  it('ログイン状態にかかわらずCookieポリシーを表示する', () => {
    const guestWrapper = createWrapper({ props: { menuVisible: true } });
    const userWrapper = createWrapper({
      props: { menuVisible: true },
      storeOverrides: { state: { user: { isLogin: true } } },
    });

    expect(guestWrapper.get('[data-testid="app-menu-cookie-policy"]').text()).to.include('Cookieポリシー');
    expect(userWrapper.get('[data-testid="app-menu-cookie-policy"]').text()).to.include('Cookieポリシー');
  });

  it('プライバシーポリシーへのメニュー項目を表示する', () => {
    const wrapper = createWrapper({ props: { menuVisible: true } });
    const privacyLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((link) => link.props('to')?.name === 'Privacy');

    expect(privacyLink).not.to.equal(undefined);
    expect(privacyLink.text()).to.include('プライバシーポリシー');
  });
  it('ログアウト成功時に一度通知し、古い操作では成功通知を出さない', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({ storeOverrides: { dispatch } });
    await wrapper.vm.clickLogoutButton();
    expect(dispatch).toHaveBeenCalledWith('doShowSnackbar', { message: 'ログアウトしました' });
    expect(dispatch.mock.calls.filter(([type]) => type === 'doShowSnackbar')).toHaveLength(1);
    dispatch.mockClear();
    dispatch.mockResolvedValueOnce(null);
    await wrapper.vm.clickLogoutButton();
    expect(dispatch).not.toHaveBeenCalledWith('doShowSnackbar', expect.anything());
  });

  it('ログアウト失敗を表示して再試行でき、待機中の重複実行を防ぐ', async () => {
    let rejectRequest;
    const dispatch = vi.fn(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    const wrapper = createWrapper({ props: { menuVisible: true }, storeOverrides: { state: { user: { isLogin: true } }, dispatch } });
    const pending = wrapper.vm.clickLogoutButton();
    await wrapper.vm.clickLogoutButton();
    expect(dispatch).toHaveBeenCalledTimes(1);
    rejectRequest(new Error('offline'));
    await pending;
    expect(wrapper.get('[role="alert"]').text()).toContain('再試行');
    expect(wrapper.vm.logoutPending).toBe(false);
    expect(dispatch).not.toHaveBeenCalledWith('doShowSnackbar', expect.anything());
    expect(wrapper.emitted()['update:menuVisible']).toBeUndefined();
    dispatch.mockResolvedValueOnce();
    await wrapper.vm.clickLogoutButton();
    expect(wrapper.vm.logoutError).toBe(false);
    expect(wrapper.emitted()['update:menuVisible'][0]).toEqual([false]);
  });

});
