import { expect, vi } from 'vitest';

import {
  createIdentityCoordinator,
  normalizeAnalyticsIdentityResponse,
} from '@/features/analytics/identityCoordinator.js';

const IDENTITY = {
  analytics_user_id: `ga1_${'a'.repeat(64)}`,
  visitor_type: 'registered',
  identity_version: 'v1',
};
const PAGE_CONTEXT = Object.freeze({
  page_group: 'login',
  page_location: 'https://app.example.invalid/login',
  page_title: 'login',
});

const createHarness = ({
  loggedIn = false,
  available = true,
  pageAvailable = true,
} = {}) => {
  const state = {
    loggedIn,
    available,
    userId: loggedIn ? '507f1f77bcf86cd799439011' : null,
    token: loggedIn ? 'user-token' : null,
    guestId: loggedIn ? null : 'guest-one',
  };
  let subscriber = null;
  let registeredConfigured = false;
  const store = {
    getters: {},
    subscribe: vi.fn((callback) => {
      subscriber = callback;
      return vi.fn();
    }),
  };
  Object.defineProperties(store.getters, {
    userIsLogin: { get: () => state.loggedIn },
    userId: { get: () => state.userId },
    userToken: { get: () => state.token },
    guestId: { get: () => state.guestId },
  });
  const runtime = {
    pause: vi.fn(),
    resume: vi.fn(() => {
      registeredConfigured = state.loggedIn;
      return Promise.resolve(true);
    }),
    clearUserIdentity: vi.fn(() => {
      if (!registeredConfigured) return false;
      registeredConfigured = false;
      return true;
    }),
    hasRegisteredUserId: vi.fn(() => registeredConfigured),
    clearPageContext: vi.fn(() => true),
    isReady: vi.fn(() => false),
  };
  const pageTracker = {
    prepareCurrentPage: vi.fn(() => (pageAvailable ? PAGE_CONTEXT : null)),
    setReady: vi.fn(() => true),
    suspend: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
  const fetchIdentity = vi.fn(() => Promise.resolve({ data: IDENTITY }));
  const coordinator = createIdentityCoordinator({
    store,
    fetchIdentity,
    runtime,
    pageTracker,
    isAvailable: () => state.available,
  });
  return {
    state,
    store,
    runtime,
    pageTracker,
    fetchIdentity,
    coordinator,
    mutate: () => subscriber?.(),
    setRegisteredConfigured: (value) => {
      registeredConfigured = value;
    },
  };
};

describe('アクセス解析の識別情報の切替', () => {
  it('初回ゲストはIdentity APIを呼ばずuser_idを省略して準備する', async () => {
    const harness = createHarness();

    expect(await harness.coordinator.start()).to.equal(true);

    expect(harness.fetchIdentity).not.toHaveBeenCalled();
    expect(harness.coordinator.getIdentity()).to.deep.equal({ visitorType: 'guest' });
    expect(harness.runtime.clearUserIdentity).not.toHaveBeenCalled();
    expect(harness.runtime.resume).toHaveBeenCalledWith({ pageContext: PAGE_CONTEXT });
    expect(harness.pageTracker.setReady).toHaveBeenLastCalledWith(true);
  });

  it('登録ユーザだけIdentity APIを呼び検証済みIDの準備後にページを解放する', async () => {
    const harness = createHarness({ loggedIn: true });

    await harness.coordinator.start();

    expect(harness.fetchIdentity).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(harness.coordinator.getIdentity()).to.deep.equal({
      userId: IDENTITY.analytics_user_id,
      visitorType: 'registered',
      version: 'v1',
    });
    expect(harness.runtime.resume).toHaveBeenCalledWith({ pageContext: PAGE_CONTEXT });
    expect(harness.pageTracker.setReady).toHaveBeenLastCalledWith(true);
  });

  it('ログイン途中でトークンまたはユーザ IDが未設定ならゲストとして送信を再開しない', async () => {
    const harness = createHarness({ loggedIn: true });
    harness.state.token = null;

    expect(await harness.coordinator.start()).to.equal(false);

    expect(harness.fetchIdentity).not.toHaveBeenCalled();
    expect(harness.coordinator.getIdentity()).to.equal(null);
    expect(harness.pageTracker.setReady).toHaveBeenCalledWith(false, {
      discardPending: true,
      acceptPending: false,
    });
    expect(harness.pageTracker.suspend).toHaveBeenCalled();
    expect(harness.pageTracker.clear).not.toHaveBeenCalled();
    expect(harness.runtime.clearPageContext).toHaveBeenCalled();
  });

  it('許可済みページコンテキストがなければIdentity APIもタグも開始しない', async () => {
    const harness = createHarness({ loggedIn: true, pageAvailable: false });

    expect(await harness.coordinator.start()).to.equal(false);

    expect(harness.fetchIdentity).not.toHaveBeenCalled();
    expect(harness.runtime.resume).not.toHaveBeenCalled();
    expect(harness.pageTracker.suspend).toHaveBeenCalled();
    expect(harness.pageTracker.clear).not.toHaveBeenCalled();
  });

  it('初回のページ設定またはpage_viewに失敗した場合は計測を停止する', async () => {
    const harness = createHarness();
    harness.pageTracker.setReady.mockReturnValue(false);

    expect(await harness.coordinator.start()).to.equal(false);

    expect(harness.runtime.pause).toHaveBeenCalled();
    expect(harness.runtime.clearPageContext).toHaveBeenCalled();
    expect(harness.coordinator.getIdentity()).to.equal(null);
  });

  it('ユーザからゲストへの切替だけuser_idをnull clearしゲスト再発行では切り替えない', async () => {
    const harness = createHarness({ loggedIn: true });
    await harness.coordinator.start();
    harness.state.loggedIn = false;
    harness.state.userId = null;
    harness.state.token = null;

    await harness.coordinator.synchronize();
    await harness.coordinator.synchronize();

    expect(harness.runtime.clearUserIdentity).toHaveBeenCalledOnce();
    expect(harness.fetchIdentity).toHaveBeenCalledOnce();
  });

  it('User-IDのnull clearに失敗した場合はゲスト送信を再開しない', async () => {
    const harness = createHarness({ loggedIn: true });
    await harness.coordinator.start();
    harness.runtime.clearUserIdentity.mockReturnValue(false);
    harness.state.loggedIn = false;
    harness.state.userId = null;
    harness.state.token = null;

    expect(await harness.coordinator.synchronize()).to.equal(false);

    expect(harness.runtime.resume).toHaveBeenCalledOnce();
    expect(harness.coordinator.getIdentity()).to.equal(null);
    expect(harness.runtime.pause).toHaveBeenCalled();
  });

  it('機能または公開設定が無効なら識別情報の取得とタグ読込を行わず、ページ送信を停止する', async () => {
    const harness = createHarness({ loggedIn: true, available: false });

    expect(await harness.coordinator.start()).to.equal(false);

    expect(harness.fetchIdentity).not.toHaveBeenCalled();
    expect(harness.runtime.pause).toHaveBeenCalled();
    expect(harness.runtime.clearUserIdentity).not.toHaveBeenCalled();
    expect(harness.pageTracker.setReady).toHaveBeenCalledWith(false, {
      discardPending: true,
      acceptPending: false,
    });
    expect(harness.pageTracker.suspend).toHaveBeenCalled();
    expect(harness.pageTracker.clear).not.toHaveBeenCalled();
  });

  it('実行中に機能が無効から有効へ変わると現在のページ情報を保って再準備する', async () => {
    const harness = createHarness();
    expect(await harness.coordinator.start()).to.equal(true);

    harness.state.available = false;
    harness.mutate();
    await Promise.resolve();

    expect(harness.pageTracker.suspend).toHaveBeenCalledOnce();
    expect(harness.pageTracker.clear).not.toHaveBeenCalled();

    harness.state.available = true;
    harness.mutate();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.pageTracker.prepareCurrentPage).toHaveBeenCalledTimes(2);
    expect(harness.runtime.resume).toHaveBeenCalledTimes(2);
    expect(harness.pageTracker.setReady).toHaveBeenLastCalledWith(true);
  });

  it('初回に無効だった機能が再取得で有効になれば状態の監視から起動する', async () => {
    const harness = createHarness({ available: false });
    expect(harness.coordinator.observe()).to.equal(true);
    harness.state.available = true;

    harness.mutate();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.runtime.resume).toHaveBeenCalledOnce();
    expect(harness.coordinator.getIdentity()).to.deep.equal({ visitorType: 'guest' });
  });

  it('遅延した旧ユーザ識別情報応答を主体変更後に破棄する', async () => {
    let resolveIdentity;
    const harness = createHarness({ loggedIn: true });
    harness.fetchIdentity.mockImplementation(
      () => new Promise((resolve) => { resolveIdentity = resolve; })
    );
    const starting = harness.coordinator.start();
    harness.state.loggedIn = false;
    harness.state.userId = null;
    harness.state.token = null;
    const guestSync = harness.coordinator.synchronize();
    resolveIdentity({ data: IDENTITY });

    await Promise.all([starting, guestSync]);

    expect(harness.coordinator.getIdentity()).to.deep.equal({ visitorType: 'guest' });
  });

  it('登録ユーザの計測準備中にログアウトしてもUser-IDの消去を行う', async () => {
    let finishRegisteredResume;
    const harness = createHarness({ loggedIn: true });
    harness.runtime.resume
      .mockImplementationOnce(
        () => new Promise((resolve) => { finishRegisteredResume = resolve; })
      )
      .mockResolvedValueOnce(true);
    const starting = harness.coordinator.start();
    await Promise.resolve();
    await Promise.resolve();
    harness.setRegisteredConfigured(true);
    harness.state.loggedIn = false;
    harness.state.userId = null;
    harness.state.token = null;

    const guestSync = harness.coordinator.synchronize();
    finishRegisteredResume(false);
    await Promise.all([starting, guestSync]);

    expect(harness.runtime.clearUserIdentity).toHaveBeenCalled();
    expect(harness.coordinator.getIdentity()).to.deep.equal({ visitorType: 'guest' });
  });

  it('識別情報の取得に失敗した場合はアクセス解析だけを停止する', async () => {
    const harness = createHarness({ loggedIn: true });
    harness.fetchIdentity.mockRejectedValue(new Error('unavailable'));

    expect(await harness.coordinator.start()).to.equal(false);

    expect(harness.runtime.clearUserIdentity).not.toHaveBeenCalled();
    expect(harness.pageTracker.setReady).toHaveBeenCalledWith(false, {
      discardPending: true,
      acceptPending: false,
    });
  });

  it('主体・利用可否が変わらないVuex 更新処理では再同期しない', async () => {
    const harness = createHarness({ loggedIn: true });
    await harness.coordinator.start();

    harness.mutate();
    await Promise.resolve();

    expect(harness.fetchIdentity).toHaveBeenCalledOnce();
    expect(harness.runtime.resume).toHaveBeenCalledOnce();
  });

  it('ゲスト認証を再発行してもアクセス解析の識別情報を切り替えない', async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    harness.state.guestId = 'guest-two';

    harness.mutate();
    await Promise.resolve();

    expect(harness.fetchIdentity).not.toHaveBeenCalled();
    expect(harness.runtime.resume).toHaveBeenCalledOnce();
    expect(harness.coordinator.getIdentity()).to.deep.equal({ visitorType: 'guest' });
  });

  it('disposeで購読・リクエスト・page/runtimeを破棄する', async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const unsubscribe = harness.store.subscribe.mock.results[0].value;

    harness.coordinator.dispose();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(harness.runtime.clearUserIdentity).toHaveBeenCalled();
    expect(harness.pageTracker.dispose).toHaveBeenCalledOnce();
    expect(harness.coordinator.getIdentity()).to.equal(null);
  });
});

describe('アクセス解析の識別情報APIの応答検証', () => {
  it('指定の3項目だけを持つ応答を受け付ける', () => {
    expect(normalizeAnalyticsIdentityResponse({ data: IDENTITY })).to.deep.equal({
      userId: IDENTITY.analytics_user_id,
      visitorType: 'registered',
      version: 'v1',
    });
    expect(() =>
      normalizeAnalyticsIdentityResponse({ data: { ...IDENTITY, raw_user_id: '507f' } })
    ).to.throw('analytics identity response is invalid');
    expect(() =>
      normalizeAnalyticsIdentityResponse({ data: { ...IDENTITY, visitor_type: 'guest' } })
    ).to.throw('analytics identity response is invalid');
  });
});
