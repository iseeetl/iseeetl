import { expect } from 'vitest';
import {
  connectInitialSocket,
  connectTimelineSocket,
  createSocket,
  disposeTimelineSocket,
  getSocketQuery,
  requestSocketReconnect,
} from '@/features/timeline/socketClient';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createFakeSocket = () => ({
  connected: false,
  disconnectCount: 0,
  disconnect() {
    this.disconnectCount += 1;
  },
});

const createReconnectHarness = ({
  userIsLogin = true,
  dispatch = () => Promise.resolve({ status: 'refreshed' }),
} = {}) => {
  const sockets = [];
  const timers = [];
  const cleanupCalls = [];
  let currentTime = 0;
  const getters = {
    roomId: 'room-reconnect',
    guestId: userIsLogin ? null : 'guest-1',
    guestToken: userIsLogin ? null : 'guest-token',
    userToken: userIsLogin ? 'user-token' : null,
    userIsLogin,
    lang: 'ja',
  };
  const ctx = {
    timelineResourcesReady: true,
    infra: {
      socket: null,
      socketStatus: 'disconnected',
      socketStatusVisible: false,
      socketRecoveryPending: false,
    },
    room: { status: null },
    dialogs: { sound: { tags: [] } },
    showSoundCautionConfirm: () => {},
    $store: { getters, dispatch },
    $i18n: { locale: 'ja' },
  };
  const deps = {
    baseUrl: 'http://example.test',
    ioClient: () => {
      const socket = createFakeSocket();
      sockets.push(socket);
      return socket;
    },
    bindSocketHandlers: (socket) => (options) => {
      cleanupCalls.push({ socket, options });
    },
    schedule: (callback) => {
      timers.push(callback);
      return timers.length - 1;
    },
    cancel: (id) => {
      timers[id] = null;
    },
    isDocumentHidden: () => false,
    now: () => currentTime,
  };
  return {
    ctx,
    deps,
    getters,
    sockets,
    timers,
    cleanupCalls,
    setCurrentTime(value) {
      currentTime = value;
    },
  };
};

describe('タイムラインのSocket接続と再接続', () => {
  it('getSocketQuery はトークンと現在表示中の言語を含める', () => {
    const ctx = {
      $store: {
        getters: {
          roomId: 'room-1',
          guestToken: 'guest-token',
          userToken: 'user-token',
          lang: 'ja',
        },
      },
      $i18n: { locale: 'en' },
    };

    const query = getSocketQuery(ctx);
    expect(query).to.deep.equal({
      room_id: 'room-1',
      guest_token: 'guest-token',
      user_token: 'user-token',
      lang: 'en',
    });
  });

  it('getSocketQuery は言語未設定なら言語設定を使う', () => {
    const ctx = {
      $store: {
        getters: {
          roomId: 'room-2',
          guestToken: null,
          userToken: null,
          lang: null,
        },
      },
      $i18n: { locale: 'en' },
    };

    const query = getSocketQuery(ctx);
    expect(query).to.deep.equal({
      room_id: 'room-2',
      lang: 'en',
    });
  });

  it('getSocketQuery は表示言語設定が無ければ保存済み言語を使う', () => {
    const ctx = {
      $store: {
        getters: {
          roomId: 'room-2',
          guestToken: null,
          userToken: null,
          lang: 'ja',
        },
      },
      $i18n: null,
    };

    expect(getSocketQuery(ctx)).to.deep.equal({ room_id: 'room-2', lang: 'ja' });
  });

  it('getSocketQuery は言語情報が無い場合に room_id のみ返す', () => {
    const ctx = {
      $store: {
        getters: {
          roomId: 'room-2',
          guestToken: null,
          userToken: null,
          lang: null,
        },
      },
      $i18n: null,
    };

    const query = getSocketQuery(ctx);
    expect(query).to.deep.equal({ room_id: 'room-2' });
  });

  it('connectTimelineSocket は再接続前に既存ソケットを切断する', () => {
    let disconnected = false;
    let cleaned = false;
    let bindCalled = false;
    const fakeSocket = {};
    const cleanup = () => {};

    const ctx = {
      infra: {
        socketStatus: 'disconnected',
        socketStatusVisible: true,
        socket: { disconnect: () => (disconnected = true) },
        socketCleanup: () => {
          cleaned = true;
        },
      },
      dialogs: { sound: { tags: [] } },
      showSoundCautionConfirm: () => {},
      $store: { getters: { roomId: 'room-3', guestToken: null, userToken: null, lang: 'ja' } },
      $i18n: { locale: 'ja' },
    };

    connectTimelineSocket(ctx, {
      ioClient: () => fakeSocket,
      baseUrl: 'http://example.test',
      bindSocketHandlers: () => {
        bindCalled = true;
        return cleanup;
      },
    });

    expect(cleaned).to.equal(true);
    expect(disconnected).to.equal(true);
    expect(bindCalled).to.equal(true);
    expect(ctx.infra.socket).to.equal(fakeSocket);
    expect(ctx.infra.socketCleanup).to.equal(cleanup);
    expect(ctx.infra.socketStatus).to.equal('connecting');
    expect(ctx.infra.socketStatusVisible).to.equal(false);
  });

  it('connectTimelineSocket はサウンドタグがあれば注意を表示する', () => {
    let cautionCalled = false;
    const fakeSocket = {};

    const ctx = {
      infra: {
        socketStatus: 'disconnected',
        socketStatusVisible: true,
        socket: null,
      },
      dialogs: { sound: { tags: ['tag-a'] } },
      showSoundCautionConfirm: () => {
        cautionCalled = true;
      },
      $store: { getters: { roomId: 'room-3', guestToken: null, userToken: null, lang: 'ja' } },
      $i18n: { locale: 'ja' },
    };

    connectTimelineSocket(ctx, {
      ioClient: () => fakeSocket,
      baseUrl: 'http://example.test',
      bindSocketHandlers: () => {},
    });

    expect(cautionCalled).to.equal(true);
    expect(ctx.infra.socket).to.equal(fakeSocket);
  });

  it('createSocket は依存注入の ioClient を使う', () => {
    const ioCalls = [];
    const socket = {};
    const ioClient = (baseUrl, options) => {
      ioCalls.push({ baseUrl, options });
      return socket;
    };

    const result = createSocket({ room_id: 'room-4' }, { ioClient, baseUrl: 'http://example.test' });

    expect(result).to.equal(socket);
    expect(ioCalls).to.have.lengthOf(1);
    expect(ioCalls[0]).to.deep.equal({
      baseUrl: 'http://example.test',
      options: { query: { room_id: 'room-4' }, forceNew: true },
    });
  });

  it('connectTimelineSocket は接続処理中のソケットを重複生成しない', () => {
    const socket = {};
    let ioCallCount = 0;
    const ctx = {
      infra: {
        socketStatus: 'connecting',
        socketStatusVisible: false,
        socket,
      },
      dialogs: { sound: { tags: [] } },
      $store: { getters: { roomId: 'room-3', guestToken: null, userToken: null, lang: 'ja' } },
      $i18n: { locale: 'ja' },
    };

    const result = connectTimelineSocket(ctx, {
      ioClient: () => {
        ioCallCount += 1;
        return {};
      },
      baseUrl: 'http://example.test',
    });

    expect(result).to.equal(socket);
    expect(ioCallCount).to.equal(0);
    expect(ctx.infra.socket).to.equal(socket);
  });

  it('createSocket は io プロパティのクライアントを解決する', () => {
    const ioCalls = [];
    const socket = {};
    const ioClient = {
      io: (baseUrl, options) => {
        ioCalls.push({ baseUrl, options });
        return socket;
      },
    };

    const result = createSocket({ room_id: 'room-4' }, { ioClient, baseUrl: 'http://example.test' });

    expect(result).to.equal(socket);
    expect(ioCalls).to.have.lengthOf(1);
  });

  it('createSocket は baseUrl のパスを除去する', () => {
    const ioCalls = [];
    const ioClient = (baseUrl, options) => {
      ioCalls.push({ baseUrl, options });
      return {};
    };

    createSocket({ room_id: 'room-5' }, { ioClient, baseUrl: 'http://example.test/api/v1' });

    expect(ioCalls).to.have.lengthOf(1);
    expect(ioCalls[0].baseUrl).to.equal('http://example.test');
  });

  it('createSocket は不正な baseUrl でもそのまま渡す', () => {
    const ioCalls = [];
    const ioClient = (baseUrl, options) => {
      ioCalls.push({ baseUrl, options });
      return {};
    };

    createSocket({ room_id: 'room-6' }, { ioClient, baseUrl: 'http://%zz' });

    expect(ioCalls).to.have.lengthOf(1);
    expect(ioCalls[0].baseUrl).to.equal('http://%zz');
  });

  it('createSocket は API_BASE_URL を優先する', () => {
    const ioCalls = [];
    const ioClient = (baseUrl, options) => {
      ioCalls.push({ baseUrl, options });
      return {};
    };

    createSocket({ room_id: 'room-7' }, { ioClient, apiBaseUrl: 'http://example.test/api/v1' });

    expect(ioCalls).to.have.lengthOf(1);
    expect(ioCalls[0].baseUrl).to.equal('http://example.test');
  });

  it('createSocket は baseUrl 未指定なら window.origin を使う', () => {
    const ioCalls = [];
    const ioClient = (baseUrl, options) => {
      ioCalls.push({ baseUrl, options });
      return {};
    };

    const expected = window.location.origin;
    createSocket({ room_id: 'room-8' }, { ioClient });

    expect(ioCalls).to.have.lengthOf(1);
    expect(ioCalls[0].baseUrl).to.equal(expected);
  });

  it('手動再接続は connecting 中でも古いSocketを破棄して新しく生成する', async () => {
    const harness = createReconnectHarness();
    const oldSocket = createFakeSocket();
    const cleanupOptions = [];
    harness.ctx.infra.socket = oldSocket;
    harness.ctx.infra.socketStatus = 'connecting';
    harness.ctx.infra.socketCleanup = (options) => cleanupOptions.push(options);

    const socket = await requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);

    expect(oldSocket.disconnectCount).to.equal(1);
    expect(cleanupOptions).to.deep.equal([{ preserveRecoveryListeners: true }]);
    expect(harness.sockets).to.have.lengthOf(1);
    expect(socket).to.equal(harness.sockets[0]);
    expect(harness.ctx.infra.socketReconnectReason).to.equal('manual');
  });

  it('ゲスト認証の完了を待たずに古いSocketを切断する', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({ userIsLogin: false, dispatch: () => auth.promise });
    const oldSocket = createFakeSocket();
    oldSocket.connected = true;
    harness.ctx.infra.socket = oldSocket;
    harness.ctx.infra.socketStatus = 'connected';
    harness.ctx.infra.isSocketConnect = true;

    const reconnect = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);

    expect(oldSocket.disconnectCount).to.equal(1);
    expect(harness.ctx.infra.socket).to.equal(null);
    expect(harness.ctx.infra.isSocketConnect).to.equal(false);
    expect(harness.sockets).to.have.lengthOf(0);

    auth.resolve({ status: 'refreshed' });
    await reconnect;
    expect(harness.sockets).to.have.lengthOf(1);
  });

  it('接続済みでもURL絞り込み変更は古いSocketを破棄して再生成する', async () => {
    const harness = createReconnectHarness();
    const oldSocket = createFakeSocket();
    oldSocket.connected = true;
    harness.ctx.infra.socket = oldSocket;
    harness.ctx.infra.socketStatus = 'connected';
    harness.ctx.infra.isSocketConnect = true;

    const socket = await requestSocketReconnect(harness.ctx, { force: true, reason: 'query-change' }, harness.deps);

    expect(oldSocket.disconnectCount).to.equal(1);
    expect(harness.sockets).to.have.lengthOf(1);
    expect(socket).to.equal(harness.sockets[0]);
    expect(harness.ctx.infra.socketReconnectReason).to.equal('query-change');
  });

  it('connecting の実経過時間が30秒未満なら既存Socketを再利用する', async () => {
    const harness = createReconnectHarness();
    const oldSocket = createFakeSocket();
    harness.ctx.infra.socket = oldSocket;
    harness.ctx.infra.socketStatus = 'connecting';
    harness.ctx.infra.socketConnectStartedAt = 1000;
    harness.setCurrentTime(30999);

    const socket = await requestSocketReconnect(harness.ctx, { reason: 'visibilitychange' }, harness.deps);

    expect(socket).to.equal(oldSocket);
    expect(oldSocket.disconnectCount).to.equal(0);
    expect(harness.sockets).to.have.lengthOf(0);
  });

  it('connecting の実経過時間が30秒以上なら可視復帰時にSocketを作り直す', async () => {
    const harness = createReconnectHarness();
    const oldSocket = createFakeSocket();
    harness.ctx.infra.socket = oldSocket;
    harness.ctx.infra.socketStatus = 'connecting';
    harness.ctx.infra.socketConnectStartedAt = 1000;
    harness.setCurrentTime(31000);

    await requestSocketReconnect(harness.ctx, { reason: 'visibilitychange' }, harness.deps);

    expect(oldSocket.disconnectCount).to.equal(1);
    expect(harness.sockets).to.have.lengthOf(1);
  });

  it('通常の重複復旧イベントは同じ再接続Promiseを共有する', async () => {
    const auth = createDeferred();
    let dispatchCount = 0;
    const harness = createReconnectHarness({
      userIsLogin: false,
      dispatch: () => {
        dispatchCount += 1;
        return auth.promise;
      },
    });

    const first = requestSocketReconnect(harness.ctx, { reason: 'pageshow' }, harness.deps);
    const second = requestSocketReconnect(harness.ctx, { reason: 'online' }, harness.deps);

    expect(second).to.equal(first);
    expect(dispatchCount).to.equal(1);
    auth.resolve({ status: 'refreshed' });
    await first;
    expect(harness.sockets).to.have.lengthOf(1);
  });

  it('手動再接続を連打しても古い世代はSocketを生成しない', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({ userIsLogin: false, dispatch: () => auth.promise });

    const first = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    const second = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    auth.resolve({ status: 'refreshed' });
    await Promise.all([first, second]);

    expect(harness.sockets).to.have.lengthOf(1);
    expect(harness.ctx.infra.socketReconnectGeneration).to.equal(2);
  });

  it('古い世代の失敗とfinallyは最新の再接続Promiseを変更しない', async () => {
    const firstAuth = createDeferred();
    const latestAuth = createDeferred();
    let dispatchCount = 0;
    const harness = createReconnectHarness({
      userIsLogin: false,
      dispatch: () => {
        dispatchCount += 1;
        return dispatchCount === 1 ? firstAuth.promise : latestAuth.promise;
      },
    });

    const first = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    const latest = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);

    firstAuth.reject(new Error('old auth failed'));
    await first;

    expect(harness.ctx.infra.socketReconnectPromise).to.equal(latest);
    expect(harness.ctx.infra.socketRecoveryPending).to.equal(true);
    expect(harness.sockets).to.have.lengthOf(0);

    latestAuth.resolve({ status: 'refreshed' });
    const latestSocket = await latest;

    expect(harness.ctx.infra.socket).to.equal(latestSocket);
    expect(harness.sockets).to.have.lengthOf(1);
    expect(latestSocket.disconnectCount).to.equal(0);
  });

  it('ゲスト認証の復旧に失敗した場合はSocketを作らず接続エラーを再表示できる', async () => {
    const harness = createReconnectHarness({
      userIsLogin: false,
      dispatch: () => Promise.resolve({ status: 'failed' }),
    });

    const socket = await requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);

    expect(socket).to.equal(null);
    expect(harness.sockets).to.have.lengthOf(0);
    expect(harness.ctx.infra.socketStatus).to.equal('disconnected');
    expect(harness.ctx.infra.socketRecoveryPending).to.equal(false);
    expect(harness.timers).to.have.lengthOf(1);
    harness.timers[0]();
    expect(harness.ctx.infra.socketStatusVisible).to.equal(true);
  });

  it('画面破棄後に完了した認証処理はSocketを生成しない', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({ userIsLogin: false, dispatch: () => auth.promise });
    const reconnect = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);

    disposeTimelineSocket(harness.ctx, harness.deps);
    auth.resolve({ status: 'refreshed' });
    await reconnect;

    expect(harness.sockets).to.have.lengthOf(0);
    expect(harness.ctx.infra.socket).to.equal(null);
    expect(harness.ctx.infra.socketDisposed).to.equal(true);
  });

  it('ゲスト認証の対象が切り替わった後はSocketと接続エラー表示の状態を変更しない', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({ userIsLogin: false, dispatch: () => auth.promise });

    const reconnect = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    auth.resolve({ status: 'stale' });
    await reconnect;

    expect(harness.ctx.infra.socket).to.equal(null);
    expect(harness.sockets).to.have.lengthOf(0);
    expect(harness.ctx.infra.socketStatus).to.equal('disconnected');
    expect(harness.ctx.infra.socketStatusVisible).to.equal(false);
    expect(harness.ctx.infra.socketRecoveryPending).to.equal(false);
    expect(harness.timers).to.have.lengthOf(0);
  });

  it('認証回復中にルームが変わった場合は元ルームのSocketを生成しない', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({ userIsLogin: false, dispatch: () => auth.promise });
    const reconnect = requestSocketReconnect(harness.ctx, { reason: 'query-change' }, harness.deps);

    harness.getters.roomId = 'room-other';
    auth.resolve({ status: 'refreshed' });
    await reconnect;

    expect(harness.sockets).to.have.lengthOf(0);
    expect(harness.ctx.infra.socketRecoveryPending).to.equal(false);
  });

  it('旧世代の黄帯タイマーが後から発火しても新しい再接続状態を変更しない', async () => {
    const auth = createDeferred();
    const harness = createReconnectHarness({
      userIsLogin: false,
      dispatch: () => Promise.resolve({ status: 'failed' }),
    });
    await requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    const oldStatusTimer = harness.timers[0];

    harness.ctx.$store.dispatch = () => auth.promise;
    const reconnect = requestSocketReconnect(harness.ctx, { force: true, reason: 'manual' }, harness.deps);
    oldStatusTimer();

    expect(harness.ctx.infra.socketStatusVisible).to.equal(false);
    auth.resolve({ status: 'refreshed' });
    await reconnect;
  });

  it('初期接続ではゲスト認証を復旧せず、接続の停滞を監視してSocketを作り直す', async () => {
    let dispatchCount = 0;
    const harness = createReconnectHarness({
      userIsLogin: false,
      dispatch: () => {
        dispatchCount += 1;
        return Promise.resolve({ status: 'refreshed' });
      },
    });

    connectInitialSocket(harness.ctx, harness.deps);
    const firstSocket = harness.sockets[0];
    expect(dispatchCount).to.equal(0);
    expect(harness.timers).to.have.lengthOf(1);

    harness.timers[0]();
    await harness.ctx.infra.socketReconnectPromise;

    expect(dispatchCount).to.equal(1);
    expect(firstSocket.disconnectCount).to.equal(1);
    expect(harness.sockets).to.have.lengthOf(2);
  });
});
