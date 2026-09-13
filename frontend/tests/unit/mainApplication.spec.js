import { expect, vi } from 'vitest';
import { createAnalyticsServices, createApplication } from '@/application';
import { getApiApplicationStore, resetApiApplicationStore } from '@/api/apiStoreAdapter';
import flushPromises from './helpers/flushPromises';

const createStore = () => ({
  state: {
  },
  getters: {
    userIsLogin: false,
    userRole: null,
    googleAnalyticsCapabilityEnabled: false,
  },
  dispatch: () => Promise.resolve(),
  subscribe: vi.fn(() => vi.fn()),
});

describe('アプリの生成と機能連携', () => {
  afterEach(() => {
    resetApiApplicationStore();
  });

  it('同じアプリのストアをルータとAPIクライアントへ渡す', () => {
    const applicationStore = createStore();

    const application = createApplication({ applicationStore });

    expect(application.store).to.equal(applicationStore);
    expect(getApiApplicationStore()).to.equal(applicationStore);
    expect(application.router).to.be.an('object');
    expect(application.i18n).to.be.an('object');
  });

  it('Vueプラグインの登録後、画面表示前に追加の設定処理を実行する', async () => {
    const applicationStore = createStore();
    const events = [];
    const app = {
      use: vi.fn(() => {
        events.push('use');
        return app;
      }),
      mount: vi.fn(() => {
        events.push('mount');
        return {};
      }),
    };
    const configureApp = vi.fn(() => events.push('configure'));
    const application = createApplication({
      applicationStore,
      configureApp,
      createAppImpl: () => app,
      mountApplicationImpl: ({ createVueApp, mountVueApp }) =>
        Promise.resolve(mountVueApp(createVueApp())),
    });

    await application.start();

    expect(configureApp).toHaveBeenCalledWith(app, {
      applicationStore,
      router: application.router,
      i18n: application.i18n,
    });
    expect(events).to.deep.equal(['use', 'use', 'use', 'configure', 'mount']);
  });

  it('アクセス解析をアプリごとに生成し、必要な計測操作だけをVueへ渡す', async () => {
    const applicationStore = createStore();
    const app = {
      use: vi.fn(() => app),
      provide: vi.fn(),
      onUnmount: vi.fn(),
      mount: vi.fn(() => ({})),
    };
    const application = createApplication({
      applicationStore,
      createAppImpl: () => app,
      mountApplicationImpl: ({ createVueApp, mountVueApp }) =>
        Promise.resolve(mountVueApp(createVueApp())),
    });

    await application.start();

    expect(application.analytics).to.be.an('object');
    expect(app.provide).not.toHaveBeenCalledWith('analyticsPreference', expect.anything());
    expect(app.provide).toHaveBeenCalledWith(
      'analyticsEventReporter',
      application.analytics.eventReporter
    );
    expect(app.provide).toHaveBeenCalledWith(
      'analyticsPageReporter',
      application.analytics.pageReporter
    );
    expect(Object.keys(application.analytics.pageReporter)).to.deep.equal([
      'capture',
      'activate',
      'cancel',
      'beginVirtualPage',
      'endVirtualPage',
      'restoreDeferredVirtualPage',
    ]);
    expect(app.onUnmount).toHaveBeenCalledWith(application.analytics.dispose);
  });

  it('Capability確認後にバックエンド公開設定を取得し、初期ONでGA4を有効にする', async () => {
    const browserWindow = {
      location: { origin: 'https://app.example.invalid' },
    };
    const loadGoogleTag = vi.fn().mockResolvedValue(true);
    const fetchConfig = vi.fn().mockResolvedValue({
      data: { measurement_id: 'G-UNIT1234' },
    });
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters: {
          googleAnalyticsCapabilityEnabled: true,
          userIsLogin: false,
          userId: null,
          userToken: null,
        },
        subscribe: vi.fn(() => vi.fn()),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow,
      documentObject: {},
      loadGoogleTag,
    });
    const currentRoute = { value: { name: 'Login' } };
    analytics.setRouter({ currentRoute });

    expect(analytics.isAvailable()).to.equal(false);
    expect(await Promise.all([analytics.initialize(), analytics.initialize()])).to.deep.equal([
      true,
      true,
    ]);
    expect(fetchConfig).toHaveBeenCalledOnce();
    expect(analytics.isAvailable()).to.equal(true);
    analytics.pageTracker.handleNavigation({ name: 'Login' });
    await flushPromises();
    await flushPromises();

    const commandsAfterResume = (browserWindow.dataLayer || []).map((command) => Array.from(command));
    expect(commandsAfterResume.filter(([name]) => name === 'event')).to.have.length(1);
    expect(commandsAfterResume.at(-1)[2].page_group).to.equal('login');

    currentRoute.value = { name: 'Register' };
    analytics.pageTracker.handleNavigation(currentRoute.value);
    const commands = browserWindow.dataLayer.map((command) => Array.from(command));
    expect(
      commands.filter(([name, eventName]) => name === 'event' && eventName === 'page_view')
    ).to.have.length(2);
    expect(
      commands.filter(
        ([name, eventName]) => name === 'event' && eventName === 'iseeetl_page_exit'
      )
    ).to.have.length(1);
    expect(commands.at(-1)[2].page_group).to.equal('register');
  });

  it.each([
    [false, { data: { measurement_id: 'G-UNIT1234' } }, 'Capability無効'],
    [true, { data: { measurement_id: 'invalid' } }, '公開設定不正'],
    [true, { data: { measurement_id: 'G-UNIT1234', secret: 'must-not-pass' } }, '余分なfield'],
  ])('%sでは公開設定を取得・検証できなければ計測を開始しない: %s', async (capability, response) => {
    const fetchConfig = vi.fn().mockResolvedValue(response);
    const loadGoogleTag = vi.fn().mockResolvedValue(true);
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters: {
          googleAnalyticsCapabilityEnabled: capability,
          userIsLogin: false,
          userId: null,
          userToken: null,
        },
        subscribe: vi.fn(() => vi.fn()),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow: { location: { origin: 'https://app.example.invalid' } },
      documentObject: {},
      loadGoogleTag,
    });
    analytics.setRouter({ currentRoute: { value: { name: 'Login' } } });

    expect(await analytics.initialize()).to.equal(false);
    analytics.pageTracker.handleNavigation({ name: 'Login' });
    await flushPromises();

    expect(fetchConfig).toHaveBeenCalledTimes(capability ? 1 : 0);
    expect(analytics.isAvailable()).to.equal(false);
    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('初回Capability無効後に再取得で有効になれば公開設定を一度だけ取得する', async () => {
    const state = { capability: false, loggedIn: false };
    const subscribers = [];
    const getters = {
      userId: null,
      userToken: null,
    };
    Object.defineProperties(getters, {
      googleAnalyticsCapabilityEnabled: { get: () => state.capability },
      userIsLogin: { get: () => state.loggedIn },
    });
    const fetchConfig = vi.fn().mockResolvedValue({
      data: { measurement_id: 'G-UNIT1234' },
    });
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const loadGoogleTag = vi.fn().mockResolvedValue(true);
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters,
        subscribe: vi.fn((subscriber) => {
          subscribers.push(subscriber);
          return vi.fn();
        }),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow,
      documentObject: {},
      loadGoogleTag,
    });
    analytics.setRouter({ currentRoute: { value: { name: 'Login' } } });
    analytics.coordinator.observe();

    expect(await analytics.initialize()).to.equal(false);
    expect(fetchConfig).not.toHaveBeenCalled();

    state.capability = true;
    subscribers[0]();
    await flushPromises();

    expect(fetchConfig).toHaveBeenCalledOnce();
    expect(analytics.isAvailable()).to.equal(true);

    await flushPromises();
    await flushPromises();
    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(
      browserWindow.dataLayer
        .map((command) => Array.from(command))
        .filter(([name]) => name === 'event')
    ).to.have.length(1);

    state.loggedIn = true;
    subscribers.forEach((subscriber) => subscriber());
    state.loggedIn = false;
    subscribers.forEach((subscriber) => subscriber());
    await flushPromises();

    expect(fetchConfig).toHaveBeenCalledOnce();
  });

  it('公開設定取得失敗後もCapabilityのfalse→true再取得で一度だけ再試行する', async () => {
    const state = { capability: true };
    const subscribers = [];
    const getters = {
      userIsLogin: false,
      userId: null,
      userToken: null,
    };
    Object.defineProperty(getters, 'googleAnalyticsCapabilityEnabled', {
      get: () => state.capability,
    });
    const fetchConfig = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ data: { measurement_id: 'G-UNIT1234' } });
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const loadGoogleTag = vi.fn().mockResolvedValue(true);
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters,
        subscribe: vi.fn((subscriber) => {
          subscribers.push(subscriber);
          return vi.fn();
        }),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow,
      documentObject: {},
      loadGoogleTag,
    });
    analytics.setRouter({ currentRoute: { value: { name: 'Login' } } });
    analytics.coordinator.observe();

    expect(await analytics.initialize()).to.equal(false);
    state.capability = false;
    subscribers[0]();
    state.capability = true;
    subscribers[0]();
    await flushPromises();

    expect(fetchConfig).toHaveBeenCalledTimes(2);
    expect(analytics.isAvailable()).to.equal(true);

    await flushPromises();
    await flushPromises();
    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(
      browserWindow.dataLayer
        .map((command) => Array.from(command))
        .filter(([name]) => name === 'event')
    ).to.have.length(1);
  });

  it('公開設定取得中のCapability OFF→ONでは旧失敗後に新しい設定を取得する', async () => {
    const state = { capability: true };
    const subscribers = [];
    const getters = {
      userIsLogin: false,
      userId: null,
      userToken: null,
    };
    Object.defineProperty(getters, 'googleAnalyticsCapabilityEnabled', {
      get: () => state.capability,
    });
    let rejectStaleConfig;
    const fetchConfig = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectStaleConfig = reject; })
      )
      .mockResolvedValueOnce({ data: { measurement_id: 'G-UNIT1234' } });
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters,
        subscribe: vi.fn((subscriber) => {
          subscribers.push(subscriber);
          return vi.fn();
        }),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow,
      documentObject: {},
      loadGoogleTag: vi.fn().mockResolvedValue(true),
    });
    analytics.setRouter({ currentRoute: { value: { name: 'Login' } } });
    analytics.coordinator.observe();

    const staleInitialization = analytics.initialize();
    await flushPromises();
    expect(fetchConfig).toHaveBeenCalledOnce();

    state.capability = false;
    subscribers.forEach((subscriber) => subscriber());
    state.capability = true;
    subscribers.forEach((subscriber) => subscriber());
    rejectStaleConfig(new Error('stale unavailable'));

    expect(await staleInitialization).to.equal(false);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(fetchConfig).toHaveBeenCalledTimes(2);
    expect(analytics.isAvailable()).to.equal(true);
    expect(
      browserWindow.dataLayer
        .map((command) => Array.from(command))
        .filter(([name, eventName]) => name === 'event' && eventName === 'page_view')
    ).to.have.length(1);
  });

  it('タグ準備中にルートが変わっても現在ページを設定してからpage_viewを送る', async () => {
    let resolveTag;
    const browserWindow = {
      location: { origin: 'https://app.example.invalid' },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    };
    const currentRoute = { value: { name: 'Login' } };
    const loadGoogleTag = vi.fn(
      () => new Promise((resolve) => { resolveTag = resolve; })
    );
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters: {
          googleAnalyticsCapabilityEnabled: true,
          userIsLogin: false,
          userId: null,
          userToken: null,
        },
        subscribe: vi.fn(() => vi.fn()),
      },
      analyticsApiImpl: {
        fetchConfig: vi.fn().mockResolvedValue({ data: { measurement_id: 'G-UNIT1234' } }),
        fetchIdentity: vi.fn(),
      },
      browserWindow,
      documentObject: {},
      loadGoogleTag,
    });
    analytics.setRouter({ currentRoute });
    await analytics.initialize();
    analytics.coordinator.observe();

    analytics.pageTracker.handleNavigation({
      name: 'Login',
      fullPath: '/login?token=must-not-pass',
    });
    await flushPromises();
    expect(loadGoogleTag).toHaveBeenCalledOnce();

    currentRoute.value = { name: 'Register', fullPath: '/register#secret' };
    analytics.pageTracker.handleNavigation(currentRoute.value);
    resolveTag(true);
    await flushPromises();
    await flushPromises();

    const commands = browserWindow.dataLayer.map((command) => Array.from(command));
    const configs = commands.filter(([name]) => name === 'config');
    const events = commands.filter(([name]) => name === 'event');
    expect(configs[0][2].page_group).to.equal('login');
    expect(configs.at(-1)[2].page_group).to.equal('register');
    expect(events).to.have.length(1);
    expect(events[0][2].page_group).to.equal('register');
    expect(JSON.stringify(commands)).not.to.contain('must-not-pass');
    expect(JSON.stringify(commands)).not.to.contain('secret');
  });

  it('プロフィール表示中の計測再開時に閉じた場合は、背面の設定を戻してからpage_viewを送る', async () => {
    let resolveTag;
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const loadGoogleTag = vi.fn(
      () => new Promise((resolve) => { resolveTag = resolve; })
    );
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters: {
          googleAnalyticsCapabilityEnabled: true,
          userIsLogin: false,
          userId: null,
          userToken: null,
        },
        subscribe: vi.fn(() => vi.fn()),
      },
      analyticsApiImpl: {
        fetchConfig: vi.fn().mockResolvedValue({ data: { measurement_id: 'G-UNIT1234' } }),
        fetchIdentity: vi.fn(),
      },
      browserWindow,
      documentObject: {},
      loadGoogleTag,
    });
    analytics.setRouter({ currentRoute: { value: { name: 'Login' } } });
    await analytics.initialize();
    analytics.coordinator.observe();

    const token = analytics.pageReporter.beginVirtualPage('Profile');
    await flushPromises();
    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(analytics.pageReporter.endVirtualPage(token, { restore: true })).to.equal(true);

    resolveTag(true);
    await flushPromises();
    await flushPromises();

    const commands = browserWindow.dataLayer.map((command) => Array.from(command));
    const pageGroups = commands
      .filter(([name]) => name === 'config')
      .map(([, , parameters]) => parameters.page_group);
    const events = commands.filter(([name]) => name === 'event');
    expect(pageGroups).to.deep.equal(['profile', 'login']);
    expect(events).to.have.length(1);
    expect(events[0][2].page_group).to.equal('login');
  });

  it('プロフィール表示中にログアウトした場合もゲストの背面の計測情報へ戻す', async () => {
    const state = { loggedIn: true };
    const subscribers = [];
    const getters = {
      googleAnalyticsCapabilityEnabled: true,
      userId: 'registered-user',
      userToken: 'registered-token',
    };
    Object.defineProperty(getters, 'userIsLogin', {
      get: () => state.loggedIn,
    });
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters,
        subscribe: vi.fn((subscriber) => {
          subscribers.push(subscriber);
          return vi.fn();
        }),
      },
      analyticsApiImpl: {
        fetchConfig: vi.fn().mockResolvedValue({ data: { measurement_id: 'G-UNIT1234' } }),
        fetchIdentity: vi.fn().mockResolvedValue({
          data: {
            analytics_user_id: `ga1_${'a'.repeat(64)}`,
            visitor_type: 'registered',
            identity_version: 'v1',
          },
        }),
      },
      browserWindow,
      documentObject: {},
      loadGoogleTag: vi.fn().mockResolvedValue(true),
    });
    const currentRoute = { value: { name: 'Login' } };
    analytics.setRouter({ currentRoute });
    await analytics.initialize();
    analytics.coordinator.observe();
    analytics.pageTracker.handleNavigation(currentRoute.value);
    await flushPromises();
    await flushPromises();

    const token = analytics.pageReporter.beginVirtualPage('Profile');
    state.loggedIn = false;
    subscribers.forEach((subscriber) => subscriber());
    expect(analytics.pageReporter.endVirtualPage(token, { restore: true })).to.equal(true);
    await flushPromises();
    await flushPromises();

    const events = browserWindow.dataLayer
      .map((command) => Array.from(command))
      .filter(([name, eventName]) => name === 'event' && eventName === 'page_view')
      .map(([, , parameters]) => [parameters.page_group, parameters.visitor_type]);
    expect(events).to.deep.equal([
      ['login', 'registered'],
      ['profile', 'registered'],
      ['login', 'guest'],
    ]);
    const exits = browserWindow.dataLayer
      .map((command) => Array.from(command))
      .filter(
        ([name, eventName]) => name === 'event' && eventName === 'iseeetl_page_exit'
      )
      .map(([, , parameters]) => [parameters.page_group, parameters.visitor_type]);
    expect(exits).to.deep.equal([
      ['login', 'registered'],
      ['profile', 'guest'],
    ]);
    const lastConfig = browserWindow.dataLayer
      .map((command) => Array.from(command))
      .filter(([name]) => name === 'config')
      .at(-1);
    expect(lastConfig[2]).to.include({
      page_group: 'login',
      visitor_type: 'guest',
    });
  });

  it('タイムライン表示中に計測機能を無効から有効へ切り替えても対象情報を復元する', async () => {
    const floorId = '507f1f77bcf86cd799439011';
    const roomId = '507f191e810c19729de860ea';
    const state = { capability: true };
    const subscribers = [];
    const getters = {
      userIsLogin: false,
      userId: null,
      userToken: null,
    };
    Object.defineProperty(getters, 'googleAnalyticsCapabilityEnabled', {
      get: () => state.capability,
    });
    const browserWindow = { location: { origin: 'https://app.example.invalid' } };
    const currentRoute = {
      value: {
        name: 'TimeLine',
        params: { floor_id: floorId, room_id: roomId },
      },
    };
    const fetchConfig = vi.fn().mockResolvedValue({
      data: { measurement_id: 'G-UNIT1234' },
    });
    const analytics = createAnalyticsServices({
      applicationStore: {
        getters,
        subscribe: vi.fn((subscriber) => {
          subscribers.push(subscriber);
          return vi.fn();
        }),
      },
      analyticsApiImpl: { fetchConfig, fetchIdentity: vi.fn() },
      browserWindow,
      documentObject: {},
      loadGoogleTag: vi.fn().mockResolvedValue(true),
    });
    analytics.setRouter({ currentRoute });
    analytics.coordinator.observe();

    expect(await analytics.initialize()).to.equal(true);
    const pageViewSent = vi.fn();
    const token = analytics.pageReporter.capture();
    expect(analytics.pageReporter.activate(token, {
      _id: roomId,
      title: 'ルームA',
      floor: { _id: floorId, title: 'フロアA' },
    }, pageViewSent)).to.equal(true);
    expect(pageViewSent).toHaveBeenCalledOnce();

    state.capability = false;
    subscribers.forEach((subscriber) => subscriber());
    expect(analytics.runtime.isReady()).to.equal(false);

    state.capability = true;
    subscribers.forEach((subscriber) => subscriber());
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const commands = browserWindow.dataLayer.map((command) => Array.from(command));
    const pageViews = commands.filter(
      ([name, eventName]) => name === 'event' && eventName === 'page_view'
    );
    const configs = commands.filter(([name]) => name === 'config');
    expect(fetchConfig).toHaveBeenCalledTimes(2);
    expect(pageViews).to.have.length(1);
    expect(pageViewSent).toHaveBeenCalledOnce();
    expect(configs.at(-1)[2]).to.include({
      floor_id: floorId,
      floor_title: 'フロアA',
      room_id: roomId,
      room_title: 'ルームA',
    });
    expect(analytics.eventReporter.track('timeline_view', {
      floor_id: floorId,
      floor_title: 'フロアA',
      room_id: roomId,
      room_title: 'ルームA',
    })).to.equal(true);
  });
});
