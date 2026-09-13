import { expect } from 'vitest';
import { setTestRoute, shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import authApi from '@/api/auth';
import Login from '@/views/Login.vue';
import { createApplicationI18n } from '@/i18n.js';
import flushPromises from '../helpers/flushPromises';

const LOGIN_CONSENT_MESSAGE =
  'メール・パスワードまたはGoogle、LINEログインすることで、利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意したものとみなされます。';

const baseStubs = {
  BackButton: true,
  GoogleLoginButton: true,
  LineLoginButton: true,
  UiButton: true,
  UiField: true,
  UiIcon: true,
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a v-bind="$attrs"><slot /></a>',
  },
  'i18n-t': false,
};

const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login/:floor_id?/:room_id?', name: 'Login', component: {} },
      { path: '/', name: 'Floor', component: {} },
    ],
  });
  const route = overrides.route || {};
  const params = route.params || {};
  const query = route.query || {};
  return setTestRoute(router, { name: 'Login', params, query });
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    lang: 'ja',
    capabilityStatus: 'ready',
    capabilitiesFailed: false,
    googleLoginAvailable: true,
    lineLoginAvailable: true,
    mailDeliveryAvailable: true,
    oneSignalPushAvailable: true,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createMountOptions = (overrides = {}) => ({
  stubs: { ...baseStubs, ...(overrides.stubs || {}) },
  router: overrides.router || createRouter({ route: overrides.route }),
  global: {
    plugins: [createApplicationI18n({ locale: 'ja' })],
    ...(overrides.global || {}),
  },
  mocks: {
    $store: overrides.store || createStoreMock(),
    $t: (key, values = {}) =>
      Object.entries(values).reduce((translated, [name, value]) => translated.replace(`{${name}}`, value), key),
    $i18n: { locale: 'ja' },
    ...(overrides.mocks || {}),
  },
});

describe('ログイン画面', () => {
  let originalLogin;

  beforeEach(() => {
    originalLogin = authApi.login;
  });

  afterEach(() => {
    authApi.login = originalLogin;
  });

  it('再設定リンク送信へ入室先を渡し、規約類の別タブ表示を維持する', () => {
    const query = { floor_id: 'f1', room_id: 'r1' };
    const wrapper = shallowMount(Login, createMountOptions({ route: { query } }));
    const links = wrapper.findAllComponents({ name: 'RouterLink' });
    expect(links.find((link) => link.props('to').name === 'SendResetPasswordLink').props('to')).toEqual({ name: 'SendResetPasswordLink', query });
    for (const name of ['Terms', 'Privacy', 'CookiePolicy']) {
      expect(links.find((link) => link.props('to').name === name).attributes('target')).toBe('_blank');
    }
  });

  it('無効な外部ログインとメール関連の操作を隠し、メールとパスワードのログインは維持する', () => {
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        store: createStoreMock({
          getters: {
            googleLoginAvailable: false,
            lineLoginAvailable: false,
            mailDeliveryAvailable: false,
          },
        }),
      })
    );

    expect(wrapper.find('[data-testid="login-submit"]').exists()).to.equal(true);
    expect(wrapper.findComponent({ name: 'GoogleLoginButton' }).exists()).to.equal(false);
    expect(wrapper.findComponent({ name: 'LineLoginButton' }).exists()).to.equal(false);
    expect(wrapper.get('[data-testid="login-consent-notice"]').text()).to.equal(LOGIN_CONSENT_MESSAGE);
    const cookiePolicyLink = wrapper.get('[data-testid="login-cookie-policy-link"]');
    expect(cookiePolicyLink.text()).to.equal('Cookieポリシー');
  });

  it('機能の有効状態を取得できない場合はエラーを表示して再試行できる', async () => {
    const dispatchCalls = [];
    let sdkCalls = 0;
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        store: createStoreMock({
          getters: { capabilitiesFailed: true, oneSignalPushAvailable: false },
          dispatch: (type) => dispatchCalls.push(type),
        }),
      })
    );
    wrapper.vm.initializeOneSignalSdk = () => {
      sdkCalls += 1;
      return Promise.resolve(true);
    };

    expect(wrapper.find('.capability-error[role="alert"]').exists()).to.equal(true);
    await wrapper.vm.retryCapabilities();
    expect(dispatchCalls).to.deep.equal(['doLoadCapabilities']);
    expect(sdkCalls).to.equal(0);
  });

  it('capability再取得でOneSignalが有効になった場合だけSDKを初期化する', async () => {
    const store = createStoreMock({
      getters: { capabilitiesFailed: true, oneSignalPushAvailable: false },
    });
    store.dispatch = () => {
      store.getters.oneSignalPushAvailable = true;
      return Promise.resolve();
    };
    const wrapper = shallowMount(Login, createMountOptions({ store }));
    let sdkCalls = 0;
    wrapper.vm.initializeOneSignalSdk = () => {
      sdkCalls += 1;
      return Promise.resolve(true);
    };

    const result = await wrapper.vm.retryCapabilities();

    expect(result).to.equal(true);
    expect(sdkCalls).to.equal(1);
  });

  it('パラメータを優先してroomContextQueryを組み立てる', () => {
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        route: { params: { floor_id: 'f1', room_id: 'r1' }, query: { floor_id: 'f2', room_id: 'r2' } },
      })
    );

    expect(wrapper.vm.roomContextQuery).to.deep.equal({ floor_id: 'f1', room_id: 'r1' });
  });

  it('全ログイン方式共通の同意案内に規約・ポリシーへの3リンクを表示する', () => {
    const wrapper = shallowMount(Login, createMountOptions({ route: { params: { floor_id: 'f1', room_id: 'r1' } } }));
    const expectedQuery = { floor_id: 'f1', room_id: 'r1' };
    const expectedLinks = [
      {
        testId: 'login-consent-terms-link',
        text: '利用許諾・著作権・禁止事項・免責事項',
        routeName: 'Terms',
      },
      {
        testId: 'login-consent-privacy-link',
        text: 'プライバシーポリシー',
        routeName: 'Privacy',
      },
      {
        testId: 'login-cookie-policy-link',
        text: 'Cookieポリシー',
        routeName: 'CookiePolicy',
      },
    ];

    expect(wrapper.get('[data-testid="login-consent-notice"]').text()).to.equal(LOGIN_CONSENT_MESSAGE);
    expectedLinks.forEach(({ testId, text, routeName }) => {
      const link = wrapper
        .findAllComponents({ name: 'RouterLink' })
        .find((candidate) => candidate.attributes('data-testid') === testId);
      expect(link, testId).not.to.equal(undefined);
      expect(link.text(), testId).to.equal(text);
      expect(link.props('to'), testId).to.deep.equal({ name: routeName, query: expectedQuery });
      expect(link.attributes('target'), testId).to.equal('_blank');
      expect(link.attributes('rel'), testId).to.equal('noopener noreferrer');
    });
    expect(wrapper.findAll('[data-testid="login-cookie-policy-link"]')).to.have.lengthOf(1);
  });

  it('外部ログインCapabilityの組み合わせにかかわらず同じ同意案内を表示する', () => {
    [
      { googleLoginAvailable: true, lineLoginAvailable: true },
      { googleLoginAvailable: true, lineLoginAvailable: false },
      { googleLoginAvailable: false, lineLoginAvailable: true },
      { googleLoginAvailable: false, lineLoginAvailable: false },
    ].forEach((getters) => {
      const wrapper = shallowMount(Login, createMountOptions({ store: createStoreMock({ getters }) }));

      expect(wrapper.get('[data-testid="login-consent-notice"]').text()).to.equal(LOGIN_CONSENT_MESSAGE);
      expect(wrapper.findAll('[data-testid="login-cookie-policy-link"]')).to.have.lengthOf(1);
      wrapper.unmount();
    });
  });

  it('Google公開設定不足では技術的エラー文を翻訳キーにしない', () => {
    const translatedKeys = [];
    const snackbarCalls = [];
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        mocks: {
          $t: (key) => {
            translatedKeys.push(key);
            return `translated:${key}`;
          },
        },
      })
    );
    wrapper.vm.setSnackbar = (...args) => snackbarCalls.push(args);

    wrapper.vm.onOauthError({
      code: 'GOOGLE_OAUTH_CLIENT_ID_MISSING',
      message: 'VITE_GOOGLE_OAUTH_CLIENT_ID が未設定です',
    });

    expect(translatedKeys).to.include('ログインに失敗しました');
    expect(translatedKeys).to.not.include('VITE_GOOGLE_OAUTH_CLIENT_ID が未設定です');
    expect(snackbarCalls).to.deep.equal([['translated:ログインに失敗しました', 'alert']]);
  });

  it('パスワード表示の切り替えができる', () => {
    const wrapper = shallowMount(Login, createMountOptions());

    expect(wrapper.vm.passwordFieldType).to.equal('password');
    expect(wrapper.vm.passwordVisibilityIcon).to.equal('visibility');

    wrapper.vm.togglePasswordVisibility();
    expect(wrapper.vm.passwordFieldType).to.equal('text');
    expect(wrapper.vm.passwordVisibilityIcon).to.equal('visibility_off');
  });

  it('入力前はエラーを出さず、blur後は既存の優先順位でエラーを返す', async () => {
    const wrapper = shallowMount(Login, createMountOptions());

    expect(wrapper.vm.validationMailError()).to.equal('');
    expect(wrapper.vm.validationPasswordError()).to.equal('');

    wrapper.vm.v$.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.validationMailError()).to.equal('メールの入力は必須です');
    expect(wrapper.vm.validationPasswordError()).to.equal('パスワードの入力は必須です');
  });

  it('フロア・ルームの指定があればログイン後にタイムラインへ移動する', async () => {
    const calls = [];
    authApi.login = (payload) => {
      calls.push(payload);
      return Promise.resolve({
        data: {
          user_id: 'user-1',
          user_role: 'User',
          user_name: 'name',
          lang: 'ja',
          image_name: null,
          token: 'token',
          push_enabled: false,
          onesignal_external_id: 'osv1_hmac-user-1',
        },
      });
    };

    const dispatchCalls = [];
    const pushCalls = [];
    const oneSignalLoginCalls = [];
    const originalOneSignal = window.OneSignal;
    const originalOneSignalDeferred = window.OneSignalDeferred;
    const originalOneSignalInitPromise = window.__iseeetlOneSignalInitPromise;
    window.OneSignal = {
      initialized: true,
      login: (...args) => {
        oneSignalLoginCalls.push(args);
        return Promise.resolve();
      },
    };
    window.__iseeetlOneSignalInitPromise = Promise.resolve();
    window.OneSignalDeferred = {
      push: (callback) => callback(window.OneSignal),
    };
    const router = createRouter({ route: { params: { floor_id: 'f1', room_id: 'r1' }, query: {} } });
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        }),
        router,
      })
    );

    wrapper.setData({ mail: 'user@example.com', password: 'password' });
    await wrapper.vm.$nextTick();

    try {
      await wrapper.vm.login();
      await flushPromises();
    } finally {
      window.OneSignal = originalOneSignal;
      window.OneSignalDeferred = originalOneSignalDeferred;
      window.__iseeetlOneSignalInitPromise = originalOneSignalInitPromise;
    }

    expect(calls).to.deep.equal([{ mail: 'user@example.com', password: 'password' }]);
    expect(dispatchCalls.some((call) => call.type === 'doUpdateLoginUser')).to.equal(true);
    expect(dispatchCalls.filter((call) => call.type === 'doShowSnackbar')).to.deep.equal([
      { type: 'doShowSnackbar', payload: { message: 'ログインしました', role: 'status' } },
    ]);
    expect(oneSignalLoginCalls).to.deep.equal([['osv1_hmac-user-1']]);
    expect(pushCalls[0]).to.deep.equal({ path: '/floor/f1/room/r1' });
  });

  it('push_enabled が無くても eye_friendly_mode をログインユーザ状態へ反映する', async () => {
    authApi.login = () =>
      Promise.resolve({
        data: {
          user_id: 'user-1',
          user_role: 'User',
          user_name: 'name',
          lang: 'ja',
          image_name: null,
          token: 'token',
          eye_friendly_mode: true,
        },
      });

    const dispatchCalls = [];
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        }),
      })
    );

    wrapper.setData({ mail: 'user@example.com', password: 'password' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.login();
    await flushPromises();

    const loginCall = dispatchCalls.find((call) => call.type === 'doUpdateLoginUser');
    expect(loginCall).to.not.equal(undefined);
    expect(loginCall.payload.eyeFriendlyMode).to.equal(true);
  });

  it('入力不正時はログインしない', async () => {
    const calls = [];
    authApi.login = () => {
      calls.push('called');
      return Promise.resolve({ data: {} });
    };

    const wrapper = shallowMount(Login, createMountOptions());

    await wrapper.vm.login();

    expect(calls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('ログイン失敗時はスナックバーを表示する', async () => {
    authApi.login = () => Promise.reject(new Error('fail'));
    const snackbarCalls = [];
    const wrapper = shallowMount(Login, createMountOptions());

    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.setData({ mail: 'user@example.com', password: 'password' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.login();
    await flushPromises();

    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0].message).not.to.equal('ログインしました');
    expect(snackbarCalls[0].role).to.equal('alert');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('redirectAfterLogin はID無しならフロアへ遷移する', () => {
    const pushCalls = [];
    const router = createRouter({ route: { params: {}, query: {} } });
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        router,
      })
    );

    wrapper.vm.redirectAfterLogin();

    expect(pushCalls[0]).to.deep.equal({ name: 'Floor' });
  });

  it('redirectAfterLogin はパラメータとクエリが競合した場合にパラメータを優先する', () => {
    const pushCalls = [];
    const router = createRouter({
      route: {
        params: { floor_id: 'pf', room_id: 'pr' },
        query: { floor_id: 'qf', room_id: 'qr' },
      },
    });
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(Login, createMountOptions({ router }));

    wrapper.vm.redirectAfterLogin();

    expect(pushCalls[0]).to.deep.equal({ path: '/floor/pf/room/pr' });
  });

  it('consumeOauthHashIfAny は line ハッシュを解析して afterLogin を呼ぶ', () => {
    const wrapper = shallowMount(Login, createMountOptions());
    const calls = [];
    const payload = { user_id: 'u1', user_role: 'User', user_name: 'name' };
    const raw = unescape(encodeURIComponent(JSON.stringify(payload)));
    const dataParam = encodeURIComponent(btoa(raw));

    wrapper.vm.afterLogin = (data) => calls.push(data);

    const originalHash = window.location.hash;
    const originalHistory = window.history.replaceState;
    window.location.hash = `#oauth=line&data=${dataParam}`;
    window.history.replaceState = () => {};

    try {
      wrapper.vm.consumeOauthHashIfAny();
    } finally {
      window.location.hash = originalHash;
      window.history.replaceState = originalHistory;
    }

    expect(calls[0]).to.deep.equal(payload);
  });

  it('LINE無効時は古いコールバック hashを破棄してログイン処理を行わない', () => {
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        store: createStoreMock({ getters: { lineLoginAvailable: false } }),
      })
    );
    const calls = [];
    const historyCalls = [];
    const payload = { user_id: 'u1' };
    const raw = unescape(encodeURIComponent(JSON.stringify(payload)));
    const dataParam = encodeURIComponent(btoa(raw));

    wrapper.vm.afterLogin = (data) => calls.push(data);

    const originalHash = window.location.hash;
    const originalHistory = window.history.replaceState;
    window.location.hash = `#oauth=line&data=${dataParam}`;
    window.history.replaceState = (...args) => historyCalls.push(args);

    try {
      wrapper.vm.consumeOauthHashIfAny();
    } finally {
      window.location.hash = originalHash;
      window.history.replaceState = originalHistory;
    }

    expect(calls).to.deep.equal([]);
    expect(historyCalls).to.have.lengthOf(1);
    expect(historyCalls[0][2]).to.equal(window.location.pathname + window.location.search);
  });

  it('onGoogleSuccess は loginWithGoogle を呼び afterLogin する', async () => {
    const calls = [];
    const originalLoginWithGoogle = authApi.loginWithGoogle;
    authApi.loginWithGoogle = () => Promise.resolve({ data: { user_id: 'u1' } });

    const wrapper = shallowMount(Login, createMountOptions());
    wrapper.vm.afterLogin = (data) => calls.push(data);

    try {
      await wrapper.vm.onGoogleSuccess('token');
    } finally {
      authApi.loginWithGoogle = originalLoginWithGoogle;
    }

    expect(calls[0]).to.deep.equal({ user_id: 'u1' });
  });

  it.each(['onGoogleSuccess', 'onLineSuccess'])('%sの成功時にログイン通知を一度表示する', async (method) => {
    const data = { user_id: 'u1', user_role: 'User', user_name: 'name', lang: 'ja', token: 'token' };
    const original = authApi.loginWithGoogle;
    authApi.loginWithGoogle = () => Promise.resolve({ data });
    const calls = [];
    const wrapper = shallowMount(Login, createMountOptions({
      store: createStoreMock({ dispatch: (type, payload) => calls.push({ type, payload }) }),
    }));
    try {
      await wrapper.vm[method](method === 'onGoogleSuccess' ? 'test-token' : data);
      expect(calls.filter(({ type }) => type === 'doShowSnackbar')).to.deep.equal([
        { type: 'doShowSnackbar', payload: { message: 'ログインしました', role: 'status' } },
      ]);
    } finally {
      authApi.loginWithGoogle = original;
      wrapper.unmount();
    }
  });

  it('afterLogin はクエリの floor_id/room_id を使ってタイムラインへ遷移する', () => {
    const pushCalls = [];
    const router = createRouter({ route: { params: {}, query: { floor_id: 'qf', room_id: 'qr' } } });
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      Login,
      createMountOptions({
        router,
      })
    );

    wrapper.vm.afterLogin({
      user_id: 'u1',
      user_role: 'User',
      user_name: 'name',
      lang: 'ja',
      token: 'token',
    });

    expect(pushCalls[0]).to.deep.equal({ path: '/floor/qf/room/qr' });
  });
});
