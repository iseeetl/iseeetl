import { expect, vi } from 'vitest';
import { bootstrapApp, mountApplication } from '@/bootstrapApp';
import { ONESIGNAL_SDK_LOAD_TIMEOUT_MS } from '@/utils/onesignalHelpers';

import flushPromises from './helpers/flushPromises';

const stubConsoleError = () => {
  const calls = [];
  const logger = (typeof window !== 'undefined' && window.console) || (typeof global !== 'undefined' && global.console);
  const original = logger && logger.error;
  if (logger) {
    logger.error = (...args) => {
      calls.push(args);
    };
  }
  return {
    calls,
    restore: () => {
      if (logger) {
        logger.error = original;
      }
    },
  };
};
describe('アプリの起動処理', () => {
  it('状態と機能の初期化後にアプリ生成・ルート準備・画面表示の順で実行する', async () => {
    const calls = [];
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        calls.push(type);
        return Promise.resolve();
      },
    };
    const router = {
      isReady: async () => {
        calls.push('router.isReady');
      },
    };
    const app = {};
    const analytics = {
      initialize: vi.fn(() => {
        calls.push('analytics.initialize');
        return Promise.resolve(true);
      }),
      coordinator: {
        observe: vi.fn(() => calls.push('analytics.coordinator.observe')),
      },
    };

    await mountApplication({
      store,
      router,
      createVueApp: () => {
        calls.push('createVueApp');
        return app;
      },
      mountVueApp: (receivedApp) => {
        expect(receivedApp).to.equal(app);
        calls.push('mountVueApp');
      },
      analytics,
    });

    expect(calls).to.deep.equal([
      'doLoadState',
      'doLoadCapabilities',
      'analytics.initialize',
      'doEnsureGuestAuth',
      'analytics.coordinator.observe',
      'createVueApp',
      'router.isReady',
      'mountVueApp',
    ]);
  });

  it('ルート確定前は計測用の識別情報を準備せずアプリを表示する', async () => {
    const calls = [];
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: vi.fn(() => Promise.resolve()),
    };
    const start = vi.fn();

    await mountApplication({
      store,
      router: { isReady: () => Promise.resolve() },
      createVueApp: () => ({}),
      mountVueApp: () => calls.push('mounted'),
      analytics: {
        initialize: vi.fn().mockResolvedValue(true),
        coordinator: { observe: vi.fn(), start },
      },
    });

    expect(calls).to.deep.equal(['mounted']);
    expect(start).not.toHaveBeenCalled();
  });

  it('アクセス解析の設定応答を待っていてもアプリを表示する', async () => {
    let resolveAnalytics;
    const analyticsInitialization = new Promise((resolve) => {
      resolveAnalytics = resolve;
    });
    const calls = [];

    await mountApplication({
      store: {
        getters: { oneSignalPushAvailable: false },
        dispatch: vi.fn(() => Promise.resolve()),
      },
      router: { isReady: () => Promise.resolve() },
      createVueApp: () => ({}),
      mountVueApp: () => calls.push('mounted'),
      analytics: {
        initialize: vi.fn(() => analyticsInitialization),
        coordinator: { observe: vi.fn() },
      },
    });

    expect(calls).to.deep.equal(['mounted']);
    resolveAnalytics(false);
    await flushPromises();
  });

  it.each([
    [true, '公開設定取得成功'],
    [false, 'Capabilityまたは公開設定無効'],
  ])('Analytics初期化結果が%sでもルート確定前はobserver登録だけを行う: %s', async (initialized) => {
    const observe = vi.fn();
    const start = vi.fn();
    await mountApplication({
      store: {
        getters: { oneSignalPushAvailable: false },
        dispatch: vi.fn(() => Promise.resolve()),
      },
      createVueApp: () => ({}),
      mountVueApp: vi.fn(),
      analytics: {
        initialize: vi.fn().mockResolvedValue(initialized),
        coordinator: { observe, start },
      },
    });

    expect(observe).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it('状態復元後にcapabilityとゲスト認証を初期化し、最後にアプリを生成する', async () => {
    const dispatchCalls = [];
    let appCreated = 0;
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        dispatchCalls.push(type);
        return Promise.resolve();
      },
    };

    bootstrapApp({
      store,
      createVueApp: () => {
        appCreated += 1;
      },
    });
    await flushPromises();
    await flushPromises();

    expect(dispatchCalls).to.deep.equal(['doLoadState', 'doLoadCapabilities', 'doEnsureGuestAuth']);
    expect(appCreated).to.equal(1);
  });

  it('OneSignalが利用可能な場合だけSDK初期化後にExternal IDを関連付ける', async () => {
    const calls = [];
    const store = {
      getters: { oneSignalPushAvailable: true },
      dispatch: (type) => {
        calls.push(type);
        return Promise.resolve();
      },
    };

    await bootstrapApp({
      store,
      createVueApp: () => calls.push('createVueApp'),
      initializeOneSignalSdkImpl: () => {
        calls.push('initializeOneSignalSdk');
        return Promise.resolve(true);
      },
    });

    expect(calls).to.deep.equal([
      'doLoadState',
      'doLoadCapabilities',
      'initializeOneSignalSdk',
      'doEnsureOneSignalIdentity',
      'doEnsureGuestAuth',
      'createVueApp',
    ]);
  });

  it('doLoadState が失敗しても doEnsureGuestAuth とアプリ生成を実行する', async () => {
    const dispatchCalls = [];
    let appCreated = 0;
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        dispatchCalls.push(type);
        if (type === 'doLoadState') return Promise.reject(new Error('load failed'));
        return Promise.resolve();
      },
    };

    try {
      await bootstrapApp({
        store,
        createVueApp: () => {
          appCreated += 1;
        },
      }).catch(() => {});
      await flushPromises();

      expect(dispatchCalls).to.deep.equal(['doLoadState', 'doLoadCapabilities', 'doEnsureGuestAuth']);
      expect(appCreated).to.equal(1);
      expect(consoleSpy.calls).to.have.lengthOf(1);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] doLoadState failed');
    } finally {
      consoleSpy.restore();
    }
  });

  it('doLoadCapabilities が失敗してもゲスト認証とアプリ生成を実行する', async () => {
    const dispatchCalls = [];
    let appCreated = 0;
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        dispatchCalls.push(type);
        if (type === 'doLoadCapabilities') return Promise.reject(new Error('capability failed'));
        return Promise.resolve();
      },
    };

    try {
      await bootstrapApp({
        store,
        createVueApp: () => {
          appCreated += 1;
        },
      });

      expect(dispatchCalls).to.deep.equal(['doLoadState', 'doLoadCapabilities', 'doEnsureGuestAuth']);
      expect(appCreated).to.equal(1);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] doLoadCapabilities failed');
    } finally {
      consoleSpy.restore();
    }
  });

  it('doEnsureGuestAuth が失敗してもアプリ生成を実行する', async () => {
    const dispatchCalls = [];
    let appCreated = 0;
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        dispatchCalls.push(type);
        if (type === 'doEnsureGuestAuth') return Promise.reject(new Error('guest auth failed'));
        return Promise.resolve();
      },
    };

    try {
      let threw = false;
      try {
        await bootstrapApp({
          store,
          createVueApp: () => {
            appCreated += 1;
          },
        });
        await flushPromises();
      } catch {
        threw = true;
      }

      expect(threw).to.equal(false);
      expect(dispatchCalls).to.deep.equal(['doLoadState', 'doLoadCapabilities', 'doEnsureGuestAuth']);
      expect(appCreated).to.equal(1);
      expect(consoleSpy.calls).to.have.lengthOf(1);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] doEnsureGuestAuth failed');
    } finally {
      consoleSpy.restore();
    }
  });

  it('doEnsureOneSignalIdentity が失敗してもゲスト認証とアプリ生成を実行する', async () => {
    const dispatchCalls = [];
    let appCreated = 0;
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: true },
      dispatch: (type) => {
        dispatchCalls.push(type);
        if (type === 'doEnsureOneSignalIdentity') return Promise.reject(new Error('identity failed'));
        return Promise.resolve();
      },
    };

    try {
      await bootstrapApp({
        store,
        createVueApp: () => {
          appCreated += 1;
        },
        initializeOneSignalSdkImpl: () => Promise.resolve(true),
      });

      expect(dispatchCalls).to.deep.equal([
        'doLoadState',
        'doLoadCapabilities',
        'doEnsureOneSignalIdentity',
        'doEnsureGuestAuth',
      ]);
      expect(appCreated).to.equal(1);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] doEnsureOneSignalIdentity failed');
    } finally {
      consoleSpy.restore();
    }
  });

  it('OneSignal SDK loadが失敗した場合はExternal IDを取得せず初期化を継続する', async () => {
    const calls = [];
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: true },
      dispatch: (type) => {
        calls.push(type);
        return Promise.resolve();
      },
    };

    try {
      await bootstrapApp({
        store,
        createVueApp: () => calls.push('createVueApp'),
        initializeOneSignalSdkImpl: () => Promise.reject(new Error('sdk failed')),
      });

      expect(calls).to.deep.equal([
        'doLoadState',
        'doLoadCapabilities',
        'doEnsureGuestAuth',
        'createVueApp',
      ]);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] initializeOneSignalSdk failed');
    } finally {
      consoleSpy.restore();
    }
  });

  it('OneSignal SDKが応答しなくてもタイムアウト後に初期化を継続する', async () => {
    vi.useFakeTimers();
    const calls = [];
    const consoleSpy = stubConsoleError();
    const store = {
      getters: { oneSignalPushAvailable: true },
      dispatch: (type) => {
        calls.push(type);
        return Promise.resolve();
      },
    };
    const stalledSdk = new Promise((resolve, reject) => {
      window.setTimeout(() => reject(new Error('OneSignal SDK load timed out')), ONESIGNAL_SDK_LOAD_TIMEOUT_MS);
    });

    try {
      const bootstrapping = bootstrapApp({
        store,
        createVueApp: () => calls.push('createVueApp'),
        initializeOneSignalSdkImpl: () => stalledSdk,
      });

      await vi.advanceTimersByTimeAsync(ONESIGNAL_SDK_LOAD_TIMEOUT_MS);
      await bootstrapping;

      expect(calls).to.deep.equal([
        'doLoadState',
        'doLoadCapabilities',
        'doEnsureGuestAuth',
        'createVueApp',
      ]);
      expect(consoleSpy.calls[0][0]).to.equal('[bootstrapApp] initializeOneSignalSdk failed');
    } finally {
      vi.useRealTimers();
      consoleSpy.restore();
    }
  });
});

describe('起動時の依存機能が不足している場合', () => {
  it('ストアが無い場合でも createVueApp を実行する', async () => {
    let appCreated = 0;

    await bootstrapApp({
      store: null,
      createVueApp: () => {
        appCreated += 1;
      },
    });

    expect(appCreated).to.equal(1);
  });

  it('store.dispatch が無い場合でも createVueApp を実行する', async () => {
    let appCreated = 0;

    await bootstrapApp({
      store: {},
      createVueApp: () => {
        appCreated += 1;
      },
    });

    expect(appCreated).to.equal(1);
  });

  it('createVueApp 未指定でも例外を投げない', async () => {
    const dispatchCalls = [];
    const store = {
      getters: { oneSignalPushAvailable: false },
      dispatch: (type) => {
        dispatchCalls.push(type);
        return Promise.resolve();
      },
    };

    let threw = false;
    try {
      await bootstrapApp({ store });
      await flushPromises();
    } catch {
      threw = true;
    }

    expect(threw).to.equal(false);
    expect(dispatchCalls).to.deep.equal(['doLoadState', 'doLoadCapabilities', 'doEnsureGuestAuth']);
  });
});
